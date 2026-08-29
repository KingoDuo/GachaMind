# 롤은 두 종류다.
#  - 인스턴스 롤: EC2 자체가 쓴다. ECS 에이전트가 클러스터에 등록하고 ECR 에서 이미지를 받는 권한 + SSM 접속.
#  - 태스크 실행 롤: ECS 가 태스크를 "띄울 때" 쓴다. CloudWatch 로그 쓰기, SSM 파라미터(시크릿) 읽기.
# 앱 코드가 AWS API 를 직접 부르진 않으므로 태스크 롤(task_role)은 아직 없다.

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_instance" {
  name               = "gachamind-ecs-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_instance" {
  for_each = toset([
    "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ])
  role       = aws_iam_role.ecs_instance.name
  policy_arn = each.value
}

resource "aws_iam_instance_profile" "ecs_instance" {
  name = "gachamind-ecs-instance"
  role = aws_iam_role.ecs_instance.name
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "gachamind-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# 태스크 정의의 secrets 가 가리키는 SSM 파라미터를 읽을 권한.
data "aws_iam_policy_document" "task_execution_secrets" {
  statement {
    actions   = ["ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/gachamind/*"]
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "read-gachamind-parameters"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_secrets.json
}

data "aws_caller_identity" "current" {}
