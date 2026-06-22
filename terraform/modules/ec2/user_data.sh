#!/bin/bash
set -e

# ──────────────────────────────────────────────
# Docker インストール（Amazon Linux 2023）
# ──────────────────────────────────────────────
dnf update -y
dnf install -y docker unzip

systemctl enable docker
systemctl start docker

# ec2-user を docker グループに追加
usermod -aG docker ec2-user

# ──────────────────────────────────────────────
# スワップ領域 2GB 追加
# t2.micro は RAM 1GB のため、ビルド中のメモリ不足を防ぐ
# ──────────────────────────────────────────────
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# ──────────────────────────────────────────────
# Node.js 22 インストール（nodesource 経由）
# ──────────────────────────────────────────────
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

# ──────────────────────────────────────────────
# docker-compose v2 インストール
# ──────────────────────────────────────────────
DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -SL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ──────────────────────────────────────────────
# アプリ用ディレクトリ作成
# ──────────────────────────────────────────────
mkdir -p /opt/app
chown ec2-user:ec2-user /opt/app

# ──────────────────────────────────────────────
# リポジトリ ZIP をダウンロード・展開
# ──────────────────────────────────────────────
cd /opt/app
curl -L https://github.com/yamamotonaoki3/MyBookLibrary/archive/refs/heads/main.zip -o repo.zip
unzip repo.zip
mv MyBookLibrary-main/* .
mv MyBookLibrary-main/.[!.]* . 2>/dev/null || true
rm -rf MyBookLibrary-main repo.zip
chown -R ec2-user:ec2-user /opt/app

# ──────────────────────────────────────────────
# npm install・ビルド
# t2.micro はメモリ 1GB のため Node.js のヒープ上限を明示的に引き上げる
# （デフォルトのままだと TypeScript 型チェック中に OOM で落ちる）
# ──────────────────────────────────────────────
sudo -u ec2-user bash -c "cd /opt/app/app && npm ci"
sudo -u ec2-user bash -c "cd /opt/app/app && NODE_OPTIONS='--max-old-space-size=1536' npm run build"

# ──────────────────────────────────────────────
# standalone ビルドの static ファイルをコピー
# Next.js standalone モードは static/ と public/ を自動で含まないため手動コピーが必要
# （省略すると CSS・画像が読み込まれず画面が崩れる）
# ──────────────────────────────────────────────
cp -r /opt/app/app/.next/static  /opt/app/app/.next/standalone/.next/static
cp -r /opt/app/app/public        /opt/app/app/.next/standalone/public

# ──────────────────────────────────────────────
# DBマイグレーション実行
# prisma migrate deploy は未適用のマイグレーションだけを実行するため
# 毎回実行しても安全（適用済みのものはスキップされる）
# ──────────────────────────────────────────────
sudo -u ec2-user bash -c "
  REGION=ap-northeast-1
  PROJECT=mybooklibrary
  export DATABASE_URL=\$(aws ssm get-parameter \
    --name /\${PROJECT}/DATABASE_URL \
    --with-decryption \
    --query Parameter.Value \
    --output text \
    --region \${REGION})
  cd /opt/app/app && npx prisma migrate deploy
"

# ──────────────────────────────────────────────
# start.sh の配置（Node.js 直接起動方式）
# ──────────────────────────────────────────────
cat > /opt/app/start.sh << 'EOF'
#!/bin/bash
# standalone の static ファイルを再同期（再ビルド後に備えて毎回実行）
cp -r /opt/app/app/.next/static  /opt/app/app/.next/standalone/.next/static
cp -r /opt/app/app/public        /opt/app/app/.next/standalone/public

# AWS Parameter Store から環境変数を取得
REGION="ap-northeast-1"
PROJECT="mybooklibrary"

get_param() {
  aws ssm get-parameter \
    --name "/${PROJECT}/$1" \
    --with-decryption \
    --query Parameter.Value \
    --output text \
    --region "${REGION}"
}

export AUTH_SECRET=$(get_param AUTH_SECRET)
export AUTH_GOOGLE_ID=$(get_param AUTH_GOOGLE_ID)
export AUTH_GOOGLE_SECRET=$(get_param AUTH_GOOGLE_SECRET)
export DATABASE_URL=$(get_param DATABASE_URL)
export RAKUTEN_APP_ID=$(get_param RAKUTEN_APP_ID)
export RAKUTEN_ACCESS_KEY=$(get_param RAKUTEN_ACCESS_KEY)
export CRON_SECRET=$(get_param CRON_SECRET)
export NEXTAUTH_URL=$(get_param NEXTAUTH_URL)
export SEED_ADMIN_EMAIL=$(get_param SEED_ADMIN_EMAIL)
export SEED_ADMIN_PASSWORD=$(get_param SEED_ADMIN_PASSWORD)
export CALIL_API_KEY=$(get_param CALIL_API_KEY)

# AUTH_TRUST_HOST=true はリバースプロキシ（CloudFront等）越しの NextAuth に必要
export AUTH_TRUST_HOST=true

node /opt/app/app/.next/standalone/server.js
EOF
chmod +x /opt/app/start.sh
chown ec2-user:ec2-user /opt/app/start.sh

# ──────────────────────────────────────────────
# systemd サービスで自動起動設定
# ──────────────────────────────────────────────
cat > /etc/systemd/system/mybooklibrary.service << 'EOF'
[Unit]
Description=MyBookLibrary App
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/app
ExecStart=/opt/app/start.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable mybooklibrary
systemctl start mybooklibrary
