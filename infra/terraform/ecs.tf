# ECS 클러스터 + 서비스 9개. docker-compose.yml 의 services 블록과 1:1 로 대응한다.
#
# 네트워크 모드는 bridge + 동적 호스트 포트(hostPort 0).
#   - 컨테이너는 각자 고정 포트(web 80, matchmaking 4000 …)를 열고, EC2 쪽 포트는 Docker 가 빈 것을 고른다.
#     그래서 같은 앱을 한 인스턴스에 여러 개 띄울 수 있고(web desired 2), 배포 중 옛/새 태스크가 공존한다.
#   - 밖 → 안: ECS 가 태스크를 띄우며 ALB 타깃그룹에 (인스턴스, 동적 포트) 를 직접 등록한다(load_balancer 블록).
#     Terraform 이 인스턴스를 타깃에 손으로 박던 attachment 는 없어졌다.
#   - 안 → 안: bridge 에선 컨테이너 안의 localhost 가 자기 자신이라 localhost:4000 이 통하지 않는다.
#     Service Connect 가 태스크마다 프록시를 붙여 compose 와 같은 이름(matchmaking:4000, redis:6379)을 실제 위치로 풀어준다.
#     인스턴스가 여러 대가 돼도 이름은 그대로다.
#
# 배포: 무상태 서비스는 새 태스크가 헬스체크를 통과한 뒤 옛 태스크를 내리는 롤링(min 100 / max 200).
# game-session 은 샤드 하나가 방을 메모리에 들고 있어 같은 샤드 둘이 공존하면 안 되므로 "내리고 올리기"(min 0 / max 100).
#
# 배치: 상태 있는 것(redis/postgres/rabbitmq)은 core 인스턴스에 고정(core = true, launch_type EC2),
# 나머지는 app capacity provider 로 띄운다 — app ASG 인스턴스에만 놓이고, 자리가 모자라면 ECS 가 인스턴스를 늘린다.
# app 인스턴스가 여러 대면 같은 서비스의 태스크를 인스턴스에 고르게 퍼뜨린다(spread).

resource "aws_ecs_cluster" "main" {
  name = "gachamind"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  service_connect_defaults {
    namespace = aws_service_discovery_http_namespace.main.arn
  }
}

# app ASG 를 ECS 의 "용량 공급자"로 등록한다. 이게 EC2 자동 스케일링의 실체다.
#   managed_scaling: 배치가 필요한 태스크 대비 인스턴스 수를 CapacityProviderReservation 지표로 계산해
#     target_capacity(100 = 남는 인스턴스 없이 딱 맞게)를 유지하도록 ASG desired 를 조정한다.
#     태스크가 안 들어가면 +1, 인스턴스가 비면 -1. 한 번에 한 대씩.
#   managed_draining: 인스턴스를 끄기 전에 그 위의 태스크를 정상 종료시킨다(ASG lifecycle hook).
#   managed_termination_protection 은 끈다 — 켜면 태스크가 하나라도 있는 인스턴스는 절대 안 줄여서,
#     태스크가 움직이지 않는 이 구성에선 스케일인이 영영 안 일어난다.
resource "aws_ecs_capacity_provider" "app" {
  name = "gachamind-app"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.app.arn
    managed_termination_protection = "DISABLED"
    managed_draining               = "ENABLED"

    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = 100
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 1
      instance_warmup_period    = 60
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = [aws_ecs_capacity_provider.app.name]
}

# Service Connect 가 서비스 이름을 등록하는 Cloud Map 네임스페이스. DNS 존이 아니라 프록시가 조회하는 레지스트리다.
resource "aws_service_discovery_http_namespace" "main" {
  name        = "gachamind"
  description = "gachamind ECS Service Connect"
}

locals {
  ecr = { for k, r in aws_ecr_repository.app : k => "${r.repository_url}:${var.image_tags[k]}" }

  # Service Connect 이름. compose 의 컨테이너명과 같게 둬서 env 값이 로컬/AWS 에서 같아진다.
  redis_url    = "redis://redis:6379"
  rabbitmq_url = "amqp://rabbitmq:5672"
  matchmaking  = "http://matchmaking:4000"
  user         = "http://user:4010"

  # 서비스 정의. 키가 ECS 서비스 이름이자 Service Connect 이름이 된다.
  #   image     실행할 이미지
  #   port      컨테이너 포트(없으면 null). 호스트 포트는 동적.
  #   memory    memoryReservation(MiB, soft). 인스턴스 메모리 안에서 합이 맞아야 배치된다.
  #   env       평문 환경변수
  #   secrets   환경변수 이름 → SSM 파라미터 ARN. ECS 가 기동 시 값을 주입한다.
  #   volumes   host 디렉토리 마운트
  #   connect   Service Connect 로 "불리는" 쪽인지. true 면 다른 태스크가 {이름}:{port} 로 부를 수 있다.
  #             (부르기만 하는 쪽도 프록시는 붙는다 — 모든 서비스가 참여한다)
  #   protocol  connect=true 일 때 L7 프로토콜("http"). 없으면 TCP 로 흘려보낸다(redis/amqp/postgres).
  #   lb        ALB 타깃그룹 ARN(있으면 ECS 가 타깃을 등록한다)
  #   rolling   true 면 옛/새 태스크 공존 롤링, false 면 내리고 올리기
  #   core      true 면 core 인스턴스에 고정(상태 있는 것), false 면 app 인스턴스(ASG)에만
  services = merge(
    {
      redis = {
        image   = "redis:7-alpine"
        port    = 6379
        memory  = 64
        connect = true
        core    = true
      }
      postgres = {
        image   = "postgres:16-alpine"
        port    = 5432
        memory  = 192
        env     = { POSTGRES_USER = "gachamind", POSTGRES_DB = "gachamind" }
        secrets = { POSTGRES_PASSWORD = aws_ssm_parameter.postgres_password.arn }
        # 컨테이너를 갈아도 데이터가 남도록 EC2 디스크에 둔다(EC2 를 갈면 사라진다).
        volumes = [{ name = "pgdata", host_path = "/data/postgres", container_path = "/var/lib/postgresql/data" }]
        connect = true
        core    = true
        # 데이터 디렉토리를 두 프로세스가 동시에 열면 안 된다.
        rolling = false
      }
      rabbitmq = {
        image   = "rabbitmq:3-management"
        port    = 5672
        memory  = 384
        connect = true
        core    = true
      }
      web = {
        image  = local.ecr["web"]
        port   = 80
        memory = 384
        env    = { PORT = "80", MATCHMAKING_URL = local.matchmaking, USER_URL = local.user }
        lb     = aws_lb_target_group.web.arn
      }
      matchmaking = {
        image  = local.ecr["matchmaking"]
        port   = 4000
        memory = 128
        env = {
          PORT                = "4000"
          REDIS_URL           = local.redis_url
          GAME_SESSION_SHARDS = join(",", var.game_session_shards)
        }
        connect  = true
        protocol = "http"
      }
      user = {
        image    = local.ecr["user"]
        port     = 4010
        memory   = 256
        env      = { PORT = "4010" }
        secrets  = { DATABASE_URL = aws_ssm_parameter.database_url.arn, JWT_SECRET = aws_ssm_parameter.jwt_secret.arn }
        connect  = true
        protocol = "http"
      }
      results-worker = {
        image   = local.ecr["results-worker"]
        memory  = 128
        env     = { RABBITMQ_URL = local.rabbitmq_url }
        secrets = { DATABASE_URL = aws_ssm_parameter.database_url.arn }
      }
    },
    # game-session 샤드: 이름 하나당 서비스 하나(game-session-1, game-session-2 …). 태스크 정의는 SHARD_ID 만 다르다.
    # 브라우저가 wss://도메인/gs/{shard} 로 붙으면 ALB 가 그 샤드의 타깃그룹으로 보낸다.
    {
      for shard in var.game_session_shards : "game-session-${shard}" => {
        image  = local.ecr["game-session"]
        port   = 4001
        memory = 256
        env = {
          PORT            = "4001"
          SHARD_ID        = shard
          MATCHMAKING_URL = local.matchmaking
          REDIS_URL       = local.redis_url
          RABBITMQ_URL    = local.rabbitmq_url
        }
        # user 가 서명한 세션 쿠키를 검증한다. 없으면 dev-secret 으로 검증해 로그인한 사람도 게스트로 보인다.
        secrets = { JWT_SECRET = aws_ssm_parameter.jwt_secret.arn }
        lb      = aws_lb_target_group.game_session[shard].arn
        rolling = false
      }
    },
  )

  service_defaults = {
    port     = null
    env      = {}
    secrets  = {}
    volumes  = []
    connect  = false
    protocol = null
    lb       = null
    rolling  = true
    core     = false
  }
  svc = { for k, v in local.services : k => merge(local.service_defaults, v) }
}

resource "aws_cloudwatch_log_group" "svc" {
  for_each          = local.svc
  name              = "/gachamind/${each.key}"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "svc" {
  for_each = local.svc

  family                   = "gachamind-${each.key}"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  dynamic "volume" {
    for_each = each.value.volumes
    content {
      name      = volume.value.name
      host_path = volume.value.host_path
    }
  }

  container_definitions = jsonencode([
    {
      name              = each.key
      image             = each.value.image
      essential         = true
      memoryReservation = each.value.memory
      # portMappings.name 은 Service Connect 가 "어느 포트를 이름으로 내놓을지" 고르는 키다.
      portMappings = each.value.port == null ? [] : [
        merge(
          { name = each.key, containerPort = each.value.port, hostPort = 0, protocol = "tcp" },
          each.value.protocol == null ? {} : { appProtocol = each.value.protocol },
        )
      ]
      environment = [for k, v in each.value.env : { name = k, value = v }]
      secrets     = [for k, v in each.value.secrets : { name = k, valueFrom = v }]
      mountPoints = [for v in each.value.volumes : { sourceVolume = v.name, containerPath = v.container_path }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.svc[each.key].name
          awslogs-region        = var.region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "svc" {
  for_each = local.svc

  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.svc[each.key].arn
  desired_count   = 1

  # core 는 capacity provider 밖의 고정 인스턴스라 launch_type EC2, app 은 capacity provider 로 띄운다.
  # capacity provider 로 띄운 태스크만 관리형 스케일링의 계산에 들어간다.
  launch_type = each.value.core ? "EC2" : null

  dynamic "capacity_provider_strategy" {
    for_each = each.value.core ? [] : [1]
    content {
      capacity_provider = aws_ecs_capacity_provider.app.name
      weight            = 1
    }
  }
  # capacity provider 전략을 바꾸는 갱신은 새 배포를 강제해야 받아들여진다(다른 변경이 없을 땐 영향 없음).
  force_new_deployment = !each.value.core

  deployment_minimum_healthy_percent = each.value.rolling ? 100 : 0
  deployment_maximum_percent         = each.value.rolling ? 200 : 100

  # 새 태스크 정의가 계속 실패하면 자동으로 이전 버전으로 되돌린다.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # 어느 인스턴스에 뜰지. core 는 인스턴스 ID 로 못 박는다(속성을 달려면 user_data 를 바꿔야 해서 인스턴스가 교체된다).
  # app 은 capacity provider 가 이미 app ASG 인스턴스로 한정하지만, 의도를 드러내려고 role 속성 제약도 같이 둔다.
  placement_constraints {
    type       = "memberOf"
    expression = each.value.core ? "ec2InstanceId == ${aws_instance.ecs_host.id}" : "attribute:role == app"
  }

  # app 인스턴스가 여러 대면 같은 서비스의 태스크를 인스턴스에 고르게 퍼뜨린다(web desired 2 → 한 대에 하나씩).
  dynamic "ordered_placement_strategy" {
    for_each = each.value.core ? [] : [1]
    content {
      type  = "spread"
      field = "instanceId"
    }
  }

  # ALB 뒤에 서는 서비스. ECS 가 태스크의 (인스턴스, 동적 포트)를 타깃그룹에 넣고 뺀다.
  dynamic "load_balancer" {
    for_each = each.value.lb == null ? [] : [each.value.lb]
    content {
      target_group_arn = load_balancer.value
      container_name   = each.key
      container_port   = each.value.port
    }
  }

  # Service Connect. 모든 서비스가 참여한다(부르는 쪽도 프록시가 있어야 이름을 풀 수 있다).
  # connect=true 인 서비스만 service 블록으로 자기 이름을 등록한다.
  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn

    log_configuration {
      log_driver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.svc[each.key].name
        awslogs-region        = var.region
        awslogs-stream-prefix = "service-connect"
      }
    }

    dynamic "service" {
      for_each = each.value.connect ? [each.key] : []
      content {
        port_name      = each.key
        discovery_name = each.key
        client_alias {
          port     = each.value.port
          dns_name = each.key
        }
      }
    }
  }

  # 타깃그룹은 리스너에 묶인 뒤에야 서비스에 붙일 수 있다.
  depends_on = [
    terraform_data.wait_for_container_instance,
    aws_ecs_cluster_capacity_providers.main,
    aws_lb_listener.https,
    aws_lb_listener_rule.game_session,
  ]
}
