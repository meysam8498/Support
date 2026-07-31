# ============================================================
# Multi-stage build for the Support Equipment Management monorepo
# پلتفرم مدیریت پروژه و تجهیزات — طراح و توسعه‌دهنده:
#   میثم ایجادی / Meysam Ijadi
#   M.Ijadi@Hotmail.com — +98 902 296 4006
#
# معماری: یک کانتینر که هم API (Express) و هم فایل‌های بیلد‌شده‌ی فرانت‌اند (static)
# را روی یک پورت سرو می‌کند. index.ts در محیط تولید، client/dist را serve می‌کند.
# ============================================================

# ───────────────────────── Stage 1: Build ─────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# ابتدا فقط manifest ها را کپی کن تا لایه‌ی وابستگی‌ها cache شود
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --workspaces --include-workspace-root

# کپی کد منبع و بیلد
COPY server ./server
COPY client ./client
RUN npm run build -w server \
 && npm run build -w client

# ───────────────────── Stage 2: Runtime ─────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# فقط وابستگی‌های production سرور
COPY package.json package-lock.json ./
COPY server/package.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev
WORKDIR /app

# artifact های بیلدشده (شامل dist/db/schema.sql که توسط copy-assets کپی می‌شود)
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# مسیر دیتای SQLite (به‌صورت volume نگه‌داری می‌شود تا داده‌ها ماندگار باشند)
RUN mkdir -p /app/server/data
VOLUME /app/server/data

# فقط پورت API؛ فرانت‌اند هم روی همان پورت serve می‌شود
EXPOSE 4000

# برچسب‌های OCI برای شناسایی image (شامل اطلاعات طراح)
LABEL org.opencontainers.image.title="Support Equipment Management" \
      org.opencontainers.image.description="پلتفرم مدیریت پروژه و تجهیزات (RTL فارسی، گارانتی، تأمین قطعات)" \
      org.opencontainers.image.author="Meysam Ijadi <M.Ijadi@Hotmail.com>" \
      org.opencontainers.image.authors="میثم ایجادی / Meysam Ijadi — +98 902 296 4006" \
      org.opencontainers.image.source="https://github.com/mijadi8498/support-equipment-management" \
      org.opencontainers.image.licenses="MIT"

# بررسی سلامت: پاسخ 200 از /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=8s --retries=3 \
    CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/app/server/data/app.db

CMD ["node", "server/dist/index.js"]
