terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "networking" {
  source  = "./modules/networking"
  project = var.project
  my_ip   = var.my_ip
}

module "ec2" {
  source           = "./modules/ec2"
  project          = var.project
  public_subnet_id = module.networking.public_subnet_id
  ec2_sg_id        = module.networking.ec2_sg_id
  key_pair_name    = var.key_pair_name
}

module "rds" {
  source             = "./modules/rds"
  project            = var.project
  private_subnet_ids = module.networking.private_subnet_ids
  rds_sg_id          = module.networking.rds_sg_id
  db_password        = var.db_password
}

module "cloudfront" {
  source         = "./modules/cloudfront"
  project        = var.project
  ec2_public_dns = module.ec2.public_dns
}

module "ssm" {
  source              = "./modules/ssm"
  project             = var.project
  auth_secret         = var.auth_secret
  auth_google_id      = var.auth_google_id
  auth_google_secret  = var.auth_google_secret
  database_url        = "mysql://admin:${var.db_password}@${module.rds.endpoint}/mybooklibrary"
  rakuten_app_id      = var.rakuten_app_id
  rakuten_access_key  = var.rakuten_access_key
  cron_secret         = var.cron_secret
  nextauth_url        = "https://${module.cloudfront.domain_name}"
  seed_admin_email    = var.seed_admin_email
  seed_admin_password = var.seed_admin_password
}
