# 호스트존은 도메인 구매 시 이미 만들어져 있으므로 data 로 읽는다.
data "aws_route53_zone" "main" {
  name = var.domain
}

# apex 는 CNAME 을 못 쓰므로 Route53 의 Alias 레코드로 ALB 를 가리킨다(무료, TTL 은 ALB 쪽을 따른다).
resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "www" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "www.${var.domain}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
