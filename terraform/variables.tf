variable "aws_region" {
  type        = string
  description = "AWS リージョン"
  default     = "ap-northeast-1"
}

variable "project" {
  type        = string
  description = "プロジェクト名（リソース名の prefix に使用）"
  default     = "mybooklibrary"
}

variable "my_ip" {
  type        = string
  description = "SSH を許可する自分の IP アドレス（CIDR 表記: xxx.xxx.xxx.xxx/32）"
}

variable "key_pair_name" {
  type        = string
  description = "EC2 キーペア名（AWS コンソールで事前作成）"
}

variable "db_password" {
  type        = string
  description = "RDS MySQL のパスワード（8文字以上・英数字記号）"
  sensitive   = true
}
