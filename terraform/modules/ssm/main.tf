variable "project" {
  type = string
}

variable "auth_secret" {
  type      = string
  sensitive = true
}

variable "auth_google_id" {
  type      = string
  sensitive = true
}

variable "auth_google_secret" {
  type      = string
  sensitive = true
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "rakuten_app_id" {
  type      = string
  sensitive = true
}

variable "rakuten_access_key" {
  type      = string
  sensitive = true
}

variable "cron_secret" {
  type      = string
  sensitive = true
}

variable "nextauth_url" {
  type = string
}

variable "seed_admin_email" {
  type = string
}

variable "seed_admin_password" {
  type      = string
  sensitive = true
}

variable "calil_api_key" {
  type      = string
  sensitive = true
}

# ──────────────────────────────────────────────
# Parameter Store（SecureString）
# ──────────────────────────────────────────────
locals {
  params = {
    AUTH_SECRET         = var.auth_secret
    AUTH_GOOGLE_ID      = var.auth_google_id
    AUTH_GOOGLE_SECRET  = var.auth_google_secret
    DATABASE_URL        = var.database_url
    RAKUTEN_APP_ID      = var.rakuten_app_id
    RAKUTEN_ACCESS_KEY  = var.rakuten_access_key
    CALIL_API_KEY       = var.calil_api_key
    CRON_SECRET         = var.cron_secret
    NEXTAUTH_URL        = var.nextauth_url
    SEED_ADMIN_EMAIL    = var.seed_admin_email
    SEED_ADMIN_PASSWORD = var.seed_admin_password
  }
}

resource "aws_ssm_parameter" "app" {
  for_each = local.params

  name  = "/${var.project}/${each.key}"
  type  = "SecureString"
  value = each.value

  tags = { Name = "${var.project}-${each.key}" }
}
