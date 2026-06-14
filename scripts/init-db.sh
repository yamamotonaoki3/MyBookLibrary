#!/bin/bash
set -e

EC2_HOST="52.69.24.11"
EC2_USER="ec2-user"
KEY="${KEY_PATH:-~/.ssh/mybooklibrary-key.pem}"
CONTAINER="mybooklibrary-app"

echo "=== RDS マイグレーションを実行 ==="
ssh -i "${KEY}" -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_HOST}" \
  "docker exec ${CONTAINER} npx prisma migrate deploy"

echo "=== マイグレーション完了 ==="
