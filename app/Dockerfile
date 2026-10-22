# ---- Build Stage ----
FROM node:22.23.4-alpine AS builder
WORKDIR /app

COPY package*.json ./
# postinstall（prisma generate）がnpm ci時点で実行されるため、
# Prismaのスキーマ・設定ファイルをこの時点で先にコピーしておく必要がある。
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime Stage ----
FROM node:22.23.4-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# 実行用の依存も同じlockfileから導入し、postinstallでPrisma Clientを生成する。
COPY --from=builder /app/package.json /app/package-lock.json /app/prisma.config.ts ./
RUN npm ci --omit=dev

EXPOSE 3000

CMD ["node", "server.js"]
