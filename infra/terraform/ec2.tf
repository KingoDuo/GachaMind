# ECS 컨테이너 인스턴스는 두 부류다. ECS 최적화 AMI(arm64)를 SSM 공개 파라미터에서 가져온다.
#   core  한 대 고정(aws_instance). 상태 있는 것(redis/postgres/rabbitmq)만 여기 뜬다.
#         Postgres 데이터가 이 인스턴스 디스크에 있어 갈아엎으면 사라진다 — 그래서 ASG 가 아니다.
#   app   ASG(0~N대). 무상태 앱과 game-session 샤드가 여기 뜬다. 인스턴스는 소모품이라 아무 때나 늘리고 줄인다.
# 어느 태스크가 어디에 뜨는지는 ecs.tf 의 placement_constraints 가 정한다(core 는 인스턴스 ID, app 은 role 속성).
# 공인 IP 는 아웃바운드(이미지 pull)용으로만 쓴다. 인바운드는 ALB 를 거친다.

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
}

resource "aws_instance" "ecs_host" {
  ami                    = data.aws_ssm_parameter.ecs_ami.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.ecs_host.id]
  iam_instance_profile   = aws_iam_instance_profile.ecs_instance.name

  user_data                   = <<-EOT
    #!/bin/bash
    echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
    mkdir -p /data/postgres
  EOT
  user_data_replace_on_change = true

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  metadata_options {
    http_tokens = "required" # IMDSv2
  }

  tags = { Name = "gachamind-ecs-host" }

  lifecycle {
    ignore_changes = [ami] # AMI 가 갱신될 때마다 인스턴스를 갈아엎지 않는다
  }
}

# ── app 인스턴스: launch template + ASG ──
# core 와 같은 AMI/롤/SG 를 쓰고, user_data 로 role=app 속성을 달아 ECS 가 무상태 태스크만 여기 두게 한다.
# core 와 같은 서브넷(AZ)에 둔다 — Service Connect 트래픽이 AZ 를 넘으면 전송 요금과 지연이 붙는다.
resource "aws_launch_template" "app" {
  name          = "gachamind-app"
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = var.app_instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.ecs_instance.name
  }

  vpc_security_group_ids = [aws_security_group.ecs_host.id]

  user_data = base64encode(<<-EOT
    #!/bin/bash
    echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
    echo 'ECS_INSTANCE_ATTRIBUTES={"role":"app"}' >> /etc/ecs/ecs.config
  EOT
  )

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 30
      volume_type = "gp3"
    }
  }

  metadata_options {
    http_tokens = "required" # IMDSv2
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "gachamind-app" }
  }

  lifecycle {
    ignore_changes = [image_id] # core 와 같은 이유. 갱신하려면 새 인스턴스를 띄우면 된다(소모품).
  }
}

resource "aws_autoscaling_group" "app" {
  name                = "gachamind-app"
  min_size            = 0
  max_size            = var.app_instance_max
  desired_capacity    = 0
  vpc_zone_identifier = [aws_subnet.public[0].id]

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  # ECS 에이전트가 클러스터에 붙으면 태스크가 배치된다. 여기까지 부팅 후 40~60초.
  # 줄일 때는 먼저 컨테이너 인스턴스를 DRAINING 으로 바꿔 태스크를 옮긴 뒤 줄인다(infra/env.sh down).
  # 그냥 desired 를 내리면 ASG 가 인스턴스를 바로 끄고, 그 위의 게임(방)은 끊긴다.

  tag {
    key                 = "Name"
    value               = "gachamind-app"
    propagate_at_launch = true
  }

  lifecycle {
    # 켜고 끄는 건 Terraform 이 아니라 운영 명령(env.sh)이 한다. apply 가 desired 를 되돌리면 안 된다.
    ignore_changes = [desired_capacity]
  }
}

# EC2 가 "생성"된 뒤 ECS 에이전트가 클러스터에 "등록"되기까지 30~60초가 걸린다.
# 그 사이에 서비스를 만들면 배치 실패가 쌓여 circuit breaker 가 배포를 실패로 굳혀버린다.
# 그래서 서비스는 이 대기 단계 뒤에 만든다.
resource "terraform_data" "wait_for_container_instance" {
  triggers_replace = [aws_instance.ecs_host.id]

  provisioner "local-exec" {
    command = <<-EOT
      for i in $(seq 1 30); do
        n=$(aws ecs list-container-instances --cluster ${aws_ecs_cluster.main.name} --region ${var.region} --query 'length(containerInstanceArns)' --output text)
        [ "$n" != "0" ] && exit 0
        sleep 10
      done
      echo "container instance did not register in time" >&2; exit 1
    EOT
  }
}
