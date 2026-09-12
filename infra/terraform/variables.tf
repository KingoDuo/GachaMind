variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "domain" {
  description = "Route53에 이미 등록된 호스트존 이름"
  type        = string
  default     = "gachamind.com"
}

variable "instance_type" {
  description = "core 인스턴스(redis/postgres/rabbitmq 고정). 이미지가 arm64 라 Graviton(t4g) 계열이어야 한다."
  type        = string
  default     = "t4g.small"
}

variable "app_instance_type" {
  description = "app 인스턴스(무상태 앱 + game-session 샤드). ASG 로 늘린다. arm64 → t4g 계열."
  type        = string
  default     = "t4g.medium"
}

variable "app_instance_max" {
  description = <<-EOT
    app ASG 최대 인스턴스 수. 대수는 ECS capacity provider 가 태스크 배치 필요에 따라 0~max 사이에서 자동 조정한다.
    infra/env.sh 가 down 때 max 를 0 으로, up 때 이 값으로 되돌린다(Terraform 은 max/desired 변경을 무시한다).
  EOT
  type        = number
  default     = 4
}

variable "image_tags" {
  description = <<-EOT
    서비스별 ECR 이미지 태그(보통 git sha). 서비스마다 따로 두는 이유:
    태그가 하나면 web 만 고쳐도 6개 태스크 정의가 전부 바뀌어 전부 재시작된다.
    배포 스크립트/워크플로우가 "바뀐 서비스 = 새 sha, 나머지 = 지금 돌고 있는 태그" 로 채워 넘긴다.
  EOT
  type        = map(string)
  validation {
    condition     = alltrue([for s in ["web", "matchmaking", "game-session", "gs-gateway", "user", "results-worker"] : contains(keys(var.image_tags), s)])
    error_message = "image_tags 에는 web, matchmaking, game-session, gs-gateway, user, results-worker 키가 모두 있어야 한다."
  }
}

variable "game_session_scaling" {
  description = <<-EOT
    game-session 태스크 오토스케일링 범위와 목표. 태스크당 vCPU 1개(task cpu 1024)를 기준으로
    평균 CPU 사용률이 target 을 넘으면 태스크(샤드)를 늘리고, 밑돌면 줄인다(방이 있는 태스크는 보호되어 안 죽는다).
    max 는 app 인스턴스 최대 대수 × 2(vCPU) 에 맞춘다.
  EOT
  type        = object({ min = number, max = number, target_cpu = number })
  default     = { min = 1, max = 8, target_cpu = 60 }
}

variable "game_session_count" {
  description = <<-EOT
    game-session 태스크(샤드) 초기 개수. 샤드는 미리 이름을 정한 목록이 아니라 태스크 하나하나이고,
    태스크가 스스로 Redis 에 이름(태스크 id)과 주소를 등록한다. 이 값은 서비스를 만들 때의 desired_count 일 뿐이고
    이후엔 오토스케일링이 소유한다(Terraform 은 desired_count 변경을 무시한다).
  EOT
  type        = number
  default     = 2
}
