#!/bin/bash
set -e

EC2_HOST="176.32.66.52"
EC2_USER="ec2-user"
KEY="${KEY_PATH:-~/.ssh/mybooklibrary-key.pem}"
IMAGE_NAME="mybooklibrary-app"
IMAGE_FILE="/tmp/mybooklibrary-app.tar.gz"
REMOTE_IMAGE_FILE="/home/ec2-user/mybooklibrary-app.tar.gz"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== [1/4] Docker イメージをビルド ==="
cd "${REPO_ROOT}/app"
docker build -t "${IMAGE_NAME}:latest" .

echo "=== [2/4] イメージを tar に保存 ==="
docker save "${IMAGE_NAME}:latest" | gzip > "${IMAGE_FILE}"
echo "イメージサイズ: $(du -sh ${IMAGE_FILE} | cut -f1)"

echo "=== [3/4] EC2 にファイルを転送 ==="
scp -i "${KEY}" -o StrictHostKeyChecking=no \
  "${IMAGE_FILE}" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_IMAGE_FILE}"

echo "=== [4/4] EC2 でコンテナを起動 ==="
ssh -i "${KEY}" -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_HOST}" << 'REMOTE'
  set -e
  echo "イメージをロード中..."
  docker load < /home/ec2-user/mybooklibrary-app.tar.gz

  echo "コンテナを再起動..."
  docker stop mybooklibrary-app 2>/dev/null || true
  docker rm mybooklibrary-app 2>/dev/null || true
  docker run -d \
    --name mybooklibrary-app \
    --restart unless-stopped \
    -p 3000:3000 \
    --env-file /opt/app/.env.production \
    mybooklibrary-app:latest

  echo "起動状態を確認..."
  docker ps --filter name=mybooklibrary-app
REMOTE

echo ""
echo "=== デプロイ完了 ==="
echo "アクセス URL: http://${EC2_HOST}:3000"
