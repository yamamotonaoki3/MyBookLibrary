variable "project" {
  type = string
}

variable "ec2_public_dns" {
  type        = string
  description = "EC2 の パブリック DNS ホスト名（CloudFront のオリジン）"
}

# ──────────────────────────────────────────────
# CloudFront ディストリビューション
# ──────────────────────────────────────────────
resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project} distribution"
  price_class     = "PriceClass_200"

  origin {
    domain_name = var.ec2_public_dns
    origin_id   = "ec2-origin"

    custom_origin_config {
      http_port              = 3000
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Next.js SSR + 認証セッションがあるためキャッシュ無効化
  default_cache_behavior {
    target_origin_id       = "ec2-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = "${var.project}-cf" }
}

# ──────────────────────────────────────────────
# Outputs
# ──────────────────────────────────────────────
output "domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "distribution_id" {
  value = aws_cloudfront_distribution.main.id
}
