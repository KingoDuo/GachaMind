# GitHub Actions 가 AWS 를 부를 수 있게 하는 신뢰 관계. 액세스 키를 GitHub 에 저장하지 않는다.
# GitHub 이 발급한 OIDC 토큰("이 잡은 KingoDuo/GachaMind 의 main 에서 실행 중")을 IAM 이 검증하고
# 15분짜리 임시 자격증명을 내준다. 다른 repo/브랜치에서는 이 롤을 못 쓴다.

variable "github_repo" {
  description = "OIDC 로 배포를 허용할 GitHub repo (owner/name)"
  type        = string
  default     = "KingoDuo/GachaMind"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # GitHub OIDC 는 AWS 가 신뢰 체인을 직접 검증하므로 thumbprint 는 형식상 값이다.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # main 브랜치의 push 에서만. PR 이나 다른 브랜치는 이 롤을 얻지 못한다.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "gachamind-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
  # 임시 자격증명 수명. 빌드+apply 가 이 안에 끝나야 한다.
  max_session_duration = 3600
}

# terraform apply 가 VPC·IAM·ECS·ALB 등 전부를 만지므로 넓은 권한이 필요하다.
# 신뢰 조건이 "이 repo 의 main" 으로 좁혀져 있어 감수한다. 인프라가 안정되면 필요한 액션만 남긴 정책으로 좁힌다.
resource "aws_iam_role_policy_attachment" "github_deploy_admin" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "github_deploy_role_arn" {
  description = "워크플로우의 role-to-assume 에 넣는 값"
  value       = aws_iam_role.github_deploy.arn
}
