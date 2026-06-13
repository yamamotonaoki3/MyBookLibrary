#!/bin/bash
set -e

# ──────────────────────────────────────────────
# Docker インストール（Amazon Linux 2023）
# ──────────────────────────────────────────────
dnf update -y
dnf install -y docker

systemctl enable docker
systemctl start docker

# ec2-user を docker グループに追加
usermod -aG docker ec2-user

# ──────────────────────────────────────────────
# アプリ用ディレクトリ作成
# ──────────────────────────────────────────────
mkdir -p /opt/app
chown ec2-user:ec2-user /opt/app
