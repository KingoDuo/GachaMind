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
  services = merge(
    {
      redis = {
        image   = "redis:7-alpine"
        port    = 6379
        memory  = 64
        connect = true
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
        # 데이터 디렉토리를 두 프로세스가 동시에 열면 안 된다.
        rolling = false
      }
      rabbitmq = {
        image   = "rabbitmq:3-management"
        port    = 5672
        memory  = 384
        connect = true
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
          PORT               = "4000"
          REDIS_URL          = local.redis_url
          GAME_SESSION_PORTS = join(",", var.game_session_ports)
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
    # game-session 샤드: 포트 하나당 서비스 하나(game-session-4001, game-session-4002 …).
    # 브라우저가 wss://도메인/gs/{port} 로 붙으면 ALB 가 그 샤드의 타깃그룹으로 보낸다.
    {
      for p in var.game_session_ports : "game-session-${p}" => {
        image  = local.ecr["game-session"]
        port   = p
        memory = 256
        env = {
          PORT            = tostring(p)
          MATCHMAKING_URL = local.matchmaking
          REDIS_URL       = local.redis_url
          RABBITMQ_URL    = local.rabbitmq_url
        }
        # user 가 서명한 세션 쿠키를 검증한다. 없으면 dev-secret 으로 검증해 로그인한 사람도 게스트로 보인다.
        secrets = { JWT_SECRET = aws_ssm_parameter.jwt_secret.arn }
        lb      = aws_lb_target_group.game_session[tostring(p)].arn
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
  launch_type     = "EC2"

  deployment_minimum_healthy_percent = each.value.rolling ? 100 : 0
  deployment_maximum_percent         = each.value.rolling ? 200 : 100

  # 새 태스크 정의가 계속 실패하면 자동으로 이전 버전으로 되돌린다.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
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
    aws_lb_listener.https,
    aws_lb_listener_rule.game_session,
  ]
}
