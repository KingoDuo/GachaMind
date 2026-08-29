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

variable "image_tag" {
  description = "ECR에 push된 앱 이미지 태그(보통 git short sha). deploy.sh 가 넘긴다."
  type        = string
}

variable "game_session_ports" {
  description = "game-session 샤드 포트 목록. 하나당 ECS 서비스가 하나 생긴다."
  type        = list(number)
  default     = [4001, 4002]
}
