# 🧰 سامانه‌ی مدیریت تجهیزات و قطعات یدکی — Support Equipment Management

پلتفرم مدیریت پروژه، تجهیزات و قطعات یدکی با رابط کاربری **فارسی (RTL)** و سیستم طراحی اختصاصی **Ember Studio** (پالت تراکوتا و کهربا).

**طراح و توسعه‌دهنده:** میثم ایجادی / Meysam Ijadi
📧 `M.Ijadi@Hotmail.com` — 📞 `+98 902 296 4006`

---

## ✨ امکانات

- 🖥️ مدیریت **تجهیزات** و **قطعات یدکی** با ردیابی سریال و شمارنده‌ی کارکرد
- 🛡️ مدیریت **گارانتی** تجهیزات با هشدار انقضا
- 🚚 **تأمین قطعات** (سفارش‌های خرید و پیگیری وضعیت)
- 📅 **تقویم شمسی (جلالی)** در تمام بخش‌ها
- 📥 **ورود سریال‌ها از فایل اکسل** (قالب فهرست قطعات انبار — منوی مخصوص مدیر)
- 🧩 جلوگیری از ثبت قطعات تکراری با تشخیص هوشمند
- 👥 نقش‌های کاربری **مدیر (admin)** و **کاربر (user)**
- 🌙 پشتیبانی از تم **روشن و تاریک**
- ❤️ Healthcheck داخلی روی `/api/health`

---

## 🚀 اجرای سریع با Docker Run

```bash
docker run -d \
  --name support-equipment \
  -p 4000:4000 \
  -v support-data:/app/server/data \
  meysam8498/support-equipment-management:latest
```

سپس مرورگر را باز کنید: **http://localhost:4000**

ورود پیش‌فرض:

| نقش | نام کاربری | رمز عبور |
|------|-----------|----------|
| مدیر | `admin` | `admin123` |
| کاربر | `user` | `user123` |

> ⚠️ **هشدار امنیتی:** حتماً قبل از استفاده‌ی واقعی، رمزهای عبور پیش‌فرض و `JWT_SECRET` را تغییر دهید (پایین را ببینید).

---

## 🐳 اجرا با Docker Compose

فایل `docker-compose.yml` را از [ریپازیتوری گیت‌هاب](https://github.com/meysam8498/Support) بردارید، سپس:

```bash
# ۱) تنظیم متغیرها (اختیاری ولی توصیه‌شده)
cp .env.example .env
# فایل .env را ویرایش کنید: JWT_SECRET و رمزهای عبور را عوض کنید

# ۲) اجرا
docker compose up -d
```

نمونه‌ی compose:

```yaml
services:
  app:
    image: meysam8498/support-equipment-management:latest
    container_name: support-equipment-app
    restart: unless-stopped
    ports:
      - "${APP_PORT:-4000}:4000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET:-please-change-this-secret-in-production}
      - JWT_EXPIRES_HOURS=${JWT_EXPIRES_HOURS:-12}
      - ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}
      - USER_USERNAME=${USER_USERNAME:-user}
      - USER_PASSWORD=${USER_PASSWORD:-user123}
    volumes:
      - app-data:/app/server/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 8s
      retries: 3

volumes:
  app-data:
```

---

## ⚙️ متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
|--------|---------|-------|
| `APP_PORT` | `4000` | پورت بیرونی (داخل کانتینر همیشه 4000 است) |
| `JWT_SECRET` | ⚠️ مقدار نمونه | کلید امضای توکن — در تولید حتماً تصادفی و طولانی باشد (`openssl rand -hex 32`) |
| `JWT_EXPIRES_HOURS` | `12` | مدت اعتبار توکن ورود (ساعت) |
| `ADMIN_USERNAME` | `admin` | نام کاربری مدیر (فقط در راه‌اندازی اولیه) |
| `ADMIN_PASSWORD` | `admin123` | رمز مدیر (فقط در راه‌اندازی اولیه) |
| `USER_USERNAME` | `user` | نام کاربری کاربر عادی (فقط در راه‌اندازی اولیه) |
| `USER_PASSWORD` | `user123` | رمز کاربر عادی (فقط در راه‌اندازی اولیه) |

---

## 💾 ماندگاری و بکاپ داده‌ها

دیتابیس **SQLite** در مسیر `/app/server/data` داخل کانتینر است و از طریق volume ماندگار می‌شود.

**بکاپ گیری:**

```bash
docker exec support-equipment-app tar czf - /app/server/data > support-backup.tar.gz
```

**بازگردانی:**

```bash
docker exec -i support-equipment-app tar xzf - < support-backup.tar.gz
```

> کاربران پیش‌فرض فقط در **اولین راه‌اندازی** (خالی بودن دیتابیس) ساخته می‌شوند؛ در بکاپ‌های بعدی تغییرشان از داخل برنامه اعمال می‌شود.

---

## 🏷️ تگ‌های موجود

| تگ | توضیح |
|----|-------|
| `latest` | آخرین نسخه‌ی پایدار |
| `ember` | نسخه با سیستم طراحی Ember Studio (هم‌digest با latest) |

حجم فشرده‌ی image: **حدود ۶۸ مگابایت** — معماری `linux/amd64`.

---

## 🔍 بررسی سلامت

```bash
curl http://localhost:4000/api/health
# {"ok":true}
```

---

## 🔗 لینک‌ها

- **سورس کد (گیت‌هاب):** https://github.com/meysam8498/Support
- **گزارش مشکل:** بخش Issues ریپازیتوری گیت‌هاب

## 📄 لایسنس

MIT — استفاده، تغییر و توزیع آزاد است.
