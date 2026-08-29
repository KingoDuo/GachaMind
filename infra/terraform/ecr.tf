# 앱 서비스마다 이미지 저장소 하나. 이미지는 deploy.sh 가 빌드해서 push 한다.
locals {
  app_services = ["web", "matchmaking", "game-session", "user", "results-worker"]
}

resource "aws_ecr_repository" "app" {
  for_each             = toset(local.app_services)
  name                 = "gachamind/${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # destroy 때 이미지가 있어도 지운다

  image_scanning_configuration {
    scan_on_push = true
  }
}

# 태그 없는(덮어써진) 이미지와 오래된 태그를 정리해 저장 비용을 막는다.
resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "untagged images expire after 1 day"
        selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 1 }
        action       = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "keep last 10 tagged images"
        selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
        action       = { type = "expire" }
      },
    ]
  })
}
