# ALB 하나가 모든 외부 트래픽의 입구다.
#   :80  → 443 으로 리다이렉트
#   :443 (ACM 인증서)
#        기본           → web (EC2:80)
#        /gs/{port}/*   → game-session 샤드 (EC2:{port})   ← 브라우저는 wss://도메인/gs/4001 로 붙는다
# 타깃은 전부 같은 EC2 인스턴스의 다른 포트다(host 네트워크). 인스턴스가 늘면 타깃만 추가하면 된다.

resource "aws_security_group" "alb" {
  name        = "gachamind-alb"
  description = "gachamind ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "gachamind-alb" }
}

resource "aws_lb" "main" {
  name               = "gachamind"
  load_balancer_type = "application"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.alb.id]

  # WebSocket 은 메시지가 없으면 idle 로 본다. game-session 이 30s 마다 ping 하므로 60s 로 충분하지만 여유를 둔다.
  idle_timeout = 120
}

# ── 타깃그룹: web ──
resource "aws_lb_target_group" "web" {
  name        = "gachamind-web"
  vpc_id      = aws_vpc.main.id
  port        = 80
  protocol    = "HTTP"
  target_type = "instance"

  health_check {
    path                = "/"
    matcher             = "200"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group_attachment" "web" {
  target_group_arn = aws_lb_target_group.web.arn
  target_id        = aws_instance.ecs_host.id
  port             = 80
}

# ── 타깃그룹: game-session 샤드(포트마다 하나) ──
resource "aws_lb_target_group" "game_session" {
  for_each    = toset([for p in var.game_session_ports : tostring(p)])
  name        = "gachamind-gs-${each.key}"
  vpc_id      = aws_vpc.main.id
  port        = tonumber(each.key)
  protocol    = "HTTP"
  target_type = "instance"

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group_attachment" "game_session" {
  for_each         = aws_lb_target_group.game_session
  target_group_arn = each.value.arn
  target_id        = aws_instance.ecs_host.id
  port             = tonumber(each.key)
}

# ── 리스너 ──
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_lb_listener_rule" "game_session" {
  for_each     = aws_lb_target_group.game_session
  listener_arn = aws_lb_listener.https.arn
  priority     = 100 + tonumber(each.key) - 4000 # 4001 → 101, 4002 → 102 …

  action {
    type             = "forward"
    target_group_arn = each.value.arn
  }

  condition {
    path_pattern {
      values = ["/gs/${each.key}", "/gs/${each.key}/*"]
    }
  }
}
