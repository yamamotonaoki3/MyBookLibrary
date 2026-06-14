output "ec2_public_ip" {
  description = "EC2 の Elastic IP（アプリへのアクセス: http://<ip>:3000）"
  value       = module.ec2.elastic_ip
}

output "ec2_instance_id" {
  description = "EC2 インスタンス ID（SSM Session Manager 接続時に使用）"
  value       = module.ec2.instance_id
}

output "rds_endpoint" {
  description = "RDS エンドポイント（DATABASE_URL に設定）"
  value       = module.rds.endpoint
}

output "rds_db_name" {
  description = "RDS データベース名"
  value       = module.rds.db_name
}

output "cloudfront_domain" {
  description = "CloudFront ドメイン（HTTPS アクセス用・NEXTAUTH_URL に設定）"
  value       = "https://${module.cloudfront.domain_name}"
}
