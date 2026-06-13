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
