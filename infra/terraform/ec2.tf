# ECS 컨테이너 인스턴스 한 대. ECS 최적화 AMI(arm64)를 SSM 공개 파라미터에서 가져온다.
# 부팅 시 user_data 로 "어느 클러스터에 등록할지"만 알려주면 ECS 에이전트가 알아서 붙는다.
# 공인 IP 는 아웃바운드(이미지 pull, 패키지)용으로만 쓴다. 인바운드는 ALB 를 거친다.

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
