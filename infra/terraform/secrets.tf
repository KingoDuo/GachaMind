# 비밀값은 Terraform 이 생성해서 SSM Parameter Store(SecureString)에 두고,
# 태스크 정의는 값이 아니라 파라미터 ARN 만 참조한다. 컨테이너가 뜰 때 ECS 가 값을 주입한다.
# (값은 tfstate 에도 남는다 — 그래서 state 를 S3 에 두고 공개하지 않는다.)

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "postgres_password" {
  name  = "/gachamind/postgres/password"
  type  = "SecureString"
  value = random_password.postgres.result
}

# user / results-worker 가 읽는 접속 문자열. 호스트명은 Service Connect 이름(ecs.tf).
resource "aws_ssm_parameter" "database_url" {
  name  = "/gachamind/database_url"
  type  = "SecureString"
  value = "postgresql://gachamind:${random_password.postgres.result}@postgres:5432/gachamind"
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/gachamind/jwt_secret"
  type  = "SecureString"
  value = random_password.jwt_secret.result
}
