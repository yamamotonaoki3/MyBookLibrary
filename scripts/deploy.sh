#!/bin/bash
set -e

EC2_HOST="52.69.24.11"
EC2_USER="ec2-user"
KEY="${KEY_PATH:-~/.ssh/mybooklibrary-key.pem}"
IMAGE_NAME="mybooklibrary-app"
IMAGE_FILE="/tmp/mybooklibrary-app.tar.gz"

echo "=== [1/4] Docker イメージをビルド ==="
cd "$(dirname "$0")/../app"
docker build -t "${IMAGE_NAME}:latest" .

echo "=== [2/4] イメージを tar に保存 ==="
docker save "${IMAGE_NAME}:latest" | gzip > "${IMAGE_FILE}"
echo "イメージサイズ: $(du -sh ${IMAGE_FILE} | cut -f1)"

echo "=== [3/4] EC2 にファイルを転送 ==="
scp -i "${KEY}" -o StrictHostKeyChecking=no \
  "${IMAGE_FILE}" \
  "${EC2_USER}@${EC2_HOST}:/tmp/"

scp -i "${KEY}" -o StrictHostKeyChecking=no \
  "$(dirname "$0")/../docker-compose.prod.yml" \
  "${EC2_USER}@${EC2_HOST}:/opt/app/"

echo "=== [4/4] EC2 でコンテナを起動 ==="
ssh -i "${KEY}" -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_HOST}" << 'REMOTE'
  set -e
  echo "イメージをロード中..."
  docker load < /tmp/mybooklibrary-app.tar.gz

  cd /opt/app
  echo "コンテナを再起動..."
  docker compose -f docker-compose.prod.yml down 2>/dev/null || true
  docker compose -f docker-compose.prod.yml up -d

  echo "起動状態を確認..."
  docker ps --filter name=mybooklibrary-app
REMOTE

echo ""
echo "=== デプロイ完了 ==="
echo "アクセス URL: http://${EC2_HOST}:3000"
