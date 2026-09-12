# 지금은 EC2 한 대가 공개 서브넷에 있고 SG로만 막는 최소 구성.
# 사설 서브넷 + NAT 는 EC2가 늘거나 관리형 DB를 붙일 때 추가한다.

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "gachamind" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "gachamind" }
}

# AZ 두 개에 공개 서브넷 하나씩. 지금은 첫 번째만 쓰지만 LB를 붙이려면 두 AZ가 필요하다.
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "gachamind-public-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "gachamind-public" }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# EC2 는 인터넷에서 직접 못 들어온다.
# 태스크는 bridge 네트워크의 동적 호스트 포트(32768~65535)로 열리므로 그 범위를
#   - ALB 에서(web/game-session 타깃)
#   - 같은 SG 의 인스턴스에서(Service Connect 프록시끼리 — 인스턴스가 여러 대일 때)
# 만 받는다. SSH 도 열지 않는다 — 접속은 SSM Session Manager 로 한다.
resource "aws_security_group" "ecs_host" {
  name        = "gachamind-ecs-host"
  description = "gachamind ECS container instance"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "ECS dynamic host ports from ALB"
    from_port       = 32768
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "ECS dynamic host ports between container instances (Service Connect)"
    from_port   = 32768
    to_port     = 65535
    protocol    = "tcp"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "gachamind-ecs-host" }
}
