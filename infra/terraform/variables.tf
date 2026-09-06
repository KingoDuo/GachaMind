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
  description = "ECS 컨테이너 인스턴스. 이미지가 arm64(Apple Silicon 빌드)라 Graviton(t4g) 계열이어야 한다."
  type        = string
  default     = "t4g.medium"
}

variable "image_tags" {
  description = <<-EOT
    서비스별 ECR 이미지 태그(보통 git sha). 서비스마다 따로 두는 이유:
    태그가 하나면 web 만 고쳐도 6개 태스크 정의가 전부 바뀌어 전부 재시작된다.
    배포 스크립트/워크플로우가 "바뀐 서비스 = 새 sha, 나머지 = 지금 돌고 있는 태그" 로 채워 넘긴다.
  EOT
  type        = map(string)
  validation {
    condition     = alltrue([for s in ["web", "matchmaking", "game-session", "user", "results-worker"] : contains(keys(var.image_tags), s)])
    error_message = "image_tags 에는 web, matchmaking, game-session, user, results-worker 키가 모두 있어야 한다."
  }
}

variable "game_session_shards" {
  description = <<-EOT
    game-session 샤드 이름 목록. 하나당 ECS 서비스(game-session-{이름})·타깃그룹·ALB 경로(/gs/{이름})가 하나씩 생긴다.
    컨테이너 포트는 전부 4001 로 같고(bridge 라 호스트 포트는 동적) 샤드는 이름으로만 구분한다.
  EOT
  type        = list(string)
  default     = ["1", "2"]
}
