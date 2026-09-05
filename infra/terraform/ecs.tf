# ECS 클러스터 + 서비스 9개. docker-compose.yml 의 services 블록과 1:1 로 대응한다.
#
# 네트워크 모드는 host — 모든 컨테이너가 EC2 의 네트워크를 그대로 쓴다.
# 그래서 compose 의 컨테이너명(redis/matchmaking…) 대신 localhost:PORT 로 서로를 부르고,
# 브라우저는 EC2 공인 IP 의 80(web)/4001~(game-session) 으로 붙는다. 로컬 pnpm dev 구성과 같은 모양이다.
#
# 인스턴스가 한 대라 롤링 배포가 불가능하다(같은 host 포트를 두 태스크가 못 쓴다).
# 그래서 min_healthy=0 / max=100 으로 "옛 태스크 내리고 새 태스크 올리기"를 한다. 그 사이 몇 초는 끊긴다.

resource "aws_ecs_cluster" "main" {
  name = "gachamind"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

locals {
  ecr = { for k, r in aws_ecr_repository.app : k => "${r.repository_url}:${var.image_tags[k]}" }

  redis_url    = "redis://localhost:6379"
  rabbitmq_url = "amqp://localhost:5672"
  matchmaking  = "http://localhost:4000"
  user         = "http://localhost:4010"

  # 서비스 정의. 키가 ECS 서비스 이름이 된다. 앱을 추가하거나 샤드를 늘리면 여기에 항목을 추가한다.
  #   image    실행할 이미지
  #   port     host 포트(없으면 null). host 모드라 containerPort == hostPort.
  #   memory   memoryReservation(MiB, soft). 인스턴스 메모리 안에서 합이 맞아야 배치된다.
  #   env      평문 환경변수
  #   secrets  환경변수 이름 → SSM 파라미터 ARN. ECS 가 기동 시 값을 주입한다.
  #   volumes  host 디렉토리 마운트
  services = merge(
    {
      redis = {
        image  = "redis:7-alpine"
        port   = 6379
        memory = 64
      }
      postgres = {
        image   = "postgres:16-alpine"
        port    = 5432
        memory  = 192
        env     = { POSTGRES_USER = "gachamind", POSTGRES_DB = "gachamind" }
        secrets = { POSTGRES_PASSWORD = aws_ssm_parameter.postgres_password.arn }
        # 컨테이너를 갈아도 데이터가 남도록 EC2 디스크에 둔다(EC2 를 갈면 사라진다).
        volumes = [{ name = "pgdata", host_path = "/data/postgres", container_path = "/var/lib/postgresql/data" }]
      }
      rabbitmq = {
        image  = "rabbitmq:3-management"
        port   = 5672
        memory = 384
      }
      web = {
        image  = local.ecr["web"]
        port   = 80
        memory = 384
        env    = { PORT = "80", MATCHMAKING_URL = local.matchmaking, USER_URL = local.user }
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
      }
      user = {
        image   = local.ecr["user"]
        port    = 4010
        memory  = 256
        env     = { PORT = "4010" }
        secrets = { DATABASE_URL = aws_ssm_parameter.database_url.arn, JWT_SECRET = aws_ssm_parameter.jwt_secret.arn }
      }
      results-worker = {
        image   = local.ecr["results-worker"]
        memory  = 128
        env     = { RABBITMQ_URL = local.rabbitmq_url }
        secrets = { DATABASE_URL = aws_ssm_parameter.database_url.arn }
      }
    },
    # game-session 샤드: 포트 하나당 서비스 하나(game-session-4001, game-session-4002 …).
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
        # user 가 서명한 세션 토큰(WS 핸드셰이크 쿠키)을 같은 시크릿으로 로컬 검증한다.
        secrets = { JWT_SECRET = aws_ssm_parameter.jwt_secret.arn }
      }
    },
  )

  service_defaults = { port = null, env = {}, secrets = {}, volumes = [] }
  svc              = { for k, v in local.services : k => merge(local.service_defaults, v) }
}

resource "aws_cloudwatch_log_group" "svc" {
  for_each          = local.svc
  name              = "/gachamind/${each.key}"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "svc" {
  for_each = local.svc

  family                   = "gachamind-${each.key}"
  network_mode             = "host"
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
      portMappings = each.value.port == null ? [] : [
        { containerPort = each.value.port, hostPort = each.value.port, protocol = "tcp" }
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

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  # 새 태스크 정의가 계속 실패하면 자동으로 이전 버전으로 되돌린다.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [terraform_data.wait_for_container_instance]
}
