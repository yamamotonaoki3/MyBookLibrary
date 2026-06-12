variable "project" {
  type = string
}

variable "public_subnet_id" {
  type = string
}

variable "ec2_sg_id" {
  type = string
}

variable "key_pair_name" {
  type        = string
  description = "EC2 キーペア名（AWS コンソールで事前作成）"
}

# ──────────────────────────────────────────────
# Amazon Linux 2023 最新 AMI を動的取得
# ──────────────────────────────────────────────
data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# ──────────────────────────────────────────────
# IAM Role（SSM Session Manager 接続用）
# ──────────────────────────────────────────────
resource "aws_iam_role" "ec2" {
  name = "${var.project}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ──────────────────────────────────────────────
# EC2 インスタンス
# ──────────────────────────────────────────────
resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023_ami.value
  instance_type          = "t2.micro"
  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [var.ec2_sg_id]
  key_name               = var.key_pair_name
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
  }

  user_data = file("${path.module}/user_data.sh")

  tags = { Name = "${var.project}-app" }
}

# ──────────────────────────────────────────────
# Elastic IP
# ──────────────────────────────────────────────
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = { Name = "${var.project}-eip" }
}

# ──────────────────────────────────────────────
# Outputs
# ──────────────────────────────────────────────
output "elastic_ip" {
  value = aws_eip.app.public_ip
}

output "instance_id" {
  value = aws_instance.app.id
}
