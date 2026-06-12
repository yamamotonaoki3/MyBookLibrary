variable "project" {
  type = string
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "RDS 用プライベートサブネット（2AZ 必須）"
}

variable "rds_sg_id" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

# ──────────────────────────────────────────────
# DB サブネットグループ（2AZ 必須）
# ──────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${var.project}-db-subnet-group" }
}

# ──────────────────────────────────────────────
# RDS MySQL 8.4
# ──────────────────────────────────────────────
resource "aws_db_instance" "main" {
  identifier              = "${var.project}-mysql"
  engine                  = "mysql"
  engine_version          = "8.4"
  instance_class          = "db.t3.micro"
  allocated_storage       = 20
  storage_type            = "gp2"
  db_name                 = "mybooklibrary"
  username                = "admin"
  password                = var.db_password
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [var.rds_sg_id]
  multi_az                = false
  publicly_accessible     = false
  skip_final_snapshot     = true
  backup_retention_period = 7

  tags = { Name = "${var.project}-mysql" }
}

# ──────────────────────────────────────────────
# Outputs
# ──────────────────────────────────────────────
output "endpoint" {
  value = aws_db_instance.main.endpoint
}

output "db_name" {
  value = aws_db_instance.main.db_name
}
