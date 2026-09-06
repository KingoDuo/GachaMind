output "url" {
  value = "https://${var.domain}"
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "ecs_host_public_ip" {
  description = "core 인스턴스 공인 IP. 아웃바운드용. 인바운드는 SG 가 ALB 로 제한한다."
  value       = aws_instance.ecs_host.public_ip
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

output "instance_id" {
  description = "core 인스턴스. aws ssm start-session --target <id> 로 접속"
  value       = aws_instance.ecs_host.id
}

output "app_asg_name" {
  description = "app 인스턴스 ASG. desired 조정은 infra/env.sh"
  value       = aws_autoscaling_group.app.name
}
