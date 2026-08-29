# HTTPS 인증서. ACM 이 무료로 발급·자동 갱신한다. 단, ACM 인증서는 EC2 에 직접 못 붙이고
# ALB/NLB/CloudFront 같은 AWS 관리형 엔드포인트에만 붙는다 — 그래서 ALB 가 필요하다(lb.tf).
# 소유 검증은 Route53 에 CNAME 을 자동으로 넣는 DNS 방식.

resource "aws_acm_certificate" "main" {
  domain_name               = var.domain
  subject_alternative_names = ["www.${var.domain}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

# 검증이 끝날 때까지 기다린다. 리스너는 이 리소스의 certificate_arn 을 써야 발급 전 인증서를 붙이지 않는다.
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}
