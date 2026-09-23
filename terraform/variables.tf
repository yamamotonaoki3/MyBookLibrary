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

# ──────────────────────────────────────────────
# アプリ環境変数（Parameter Store に登録）
# ──────────────────────────────────────────────
variable "auth_secret" {
  type        = string
  description = "NextAuth.js シークレット（openssl rand -base64 32 で生成）"
  sensitive   = true
}

variable "auth_google_id" {
  type        = string
  description = "Google OAuth クライアント ID"
  sensitive   = true
}

variable "auth_google_secret" {
  type        = string
  description = "Google OAuth クライアントシークレット"
  sensitive   = true
}

variable "rakuten_app_id" {
  type        = string
  description = "楽天ブックス API アプリ ID"
  sensitive   = true
}

variable "rakuten_access_key" {
  type        = string
  description = "楽天ブックス API アクセスキー"
  sensitive   = true
}

variable "calil_api_key" {
  type        = string
  description = "カーリル図書館 API キー"
  sensitive   = true
}

variable "cron_secret" {
  type        = string
  description = "Vercel Cron 用シークレットトークン"
  sensitive   = true
}

variable "enrichment_tick_secret" {
  type        = string
  description = "書籍データ補完ジョブ watchdog（tick）用シークレットトークン"
  sensitive   = true
}

variable "seed_admin_email" {
  type        = string
  description = "管理者アカウントのメールアドレス"
}

variable "seed_admin_password" {
  type        = string
  description = "管理者アカウントのパスワード"
  sensitive   = true
}
