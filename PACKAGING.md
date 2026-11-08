# 📦 نقشه‌ی راه بسته‌بندی — نصب‌کننده‌های ویندوز و اپ اندروید

> طرح عملی نسخه‌های بعدی. این سند تصمیم‌های فنی را ثبت می‌کند تا هر ریلیز بدون بازنگری اجرا شود.
> طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com — +98 902 296 4006

---

## ۱) دو نسخه‌ی ویندوز — نصب‌کننده‌ی مستقل

دو بسته‌ی جدا از یک سورس، با متغیر محیطی متمایز:

| بسته (نسخه) | فایل خروجی | کاربرد | متغیرهای کلیدی | داده |
|------|-------|--------|-------------|------|
| **خریدار** (`EDITION=buyer`) | `Support Equipment Management_<ver>_x64-setup.exe` | استقرار کامل مشتری (سرور + UI کنار اپ) | `LICENSE_ENFORCE=1` · `LICENSE_EDITION=buyer` | DB محلی مشتری — **ریلیز عمومی نمی‌شود**؛ فقط توزیع مستقیم/کانال فروش |
| **فروشنده** (`EDITION=seller`) | `Support Support Server_<ver>_x64-setup.exe` | نسخه‌ی شما: بررسی ایرادها + ابزار صدور لایسنس | `SUPPORT_ONLY=1` · `LICENSE_EDITION=seller` | DB نمونه — بدون داده‌ی واقعی مشتری؛ **صدور/ابطال/چرخش کلید فقط اینجا** |

### فناوری پیشنهادی: Tauri v2 (سبک، ~۱۰MB، WebView2 ویندوزی)
جایگزین‌ها: Electron (ساده‌تر، سنگین‌تر ~۱۵۰MB) یا NSIS روی Node سرویس‌شده (بدون UI دسکتاپ).

> **✅ پیاده‌سازی شد (۱.۲۶.۰)** — پوشه‌ی `desktop/`: پوسته‌ی Tauri v2 با اجرای سرور به‌صورت
> child process (باندل esbuild + `node.exe` کنار اجرایی در `resources/`)؛ پنجره به
> `http://localhost:<port>` ناوبری می‌کند و سرور همان فرانت بیلدشده را سرو می‌کند
> (بدون CORS و بدون تغییر کد کلاینت). انحراف عمدی از طرح بالا: به‌جای سرویس ویندوز
> `node-windows`، سرور چرخه‌ی عمرش با اپ است (روی `ExitRequested` خاموشی تمیز) —
> ساده‌تر برای نصب/حذف مشتری؛ سرویس ویندوز در آینده در صورت نیاز اضافه می‌شود.
> بیلد: `cd desktop && npm run build:customer` (پورت 4000 + `LICENSE_ENFORCE=1`،
> داده در `%LOCALAPPDATA%\SupportEquipment`) یا `npm run build:support`
> (پورت 4200 + `SUPPORT_ONLY=1` + کلید صدور، داده‌ی نمونه‌ی موقت).

> **✅ تفکیک نسخه — خریدار/فروشنده (۱.۳۴.۰)** — تصمیم ثبت‌شده: یک کدبیس، دو بسته‌ی نصبی؛ فورک نمی‌کنیم.
> پرچم `LICENSE_EDITION=buyer|seller` در زمان بیلد به پوسته و از آنجا به سرور فرزند پاس می‌شود
> (`desktop/src-tauri/src/main.rs`). در نصب **خریدار** مسیرهای فروشنده در سرور با ۴۰۴ بسته می‌شوند:
> `POST /api/license/issue`, `/issue-test`, `/revoke`, `/unrevoke`, `/extend`, `GET /issued`,
> `GET /sales-export.csv` و همه‌ی `/license/keys/*` (`status`, `rotations`, `rotate`, `restore`).
> **چرا:** خریدار روی نصب خودش ادمین است؛ اگر به `keys/rotate` دسترسی داشت می‌توانست جفت‌کلید خودش را
> جایگزین کند، لایسنس خودش را امضا کند و سقف نسخه‌ی آزمایشی را دور بزند. کلید خصوصی هم (مثل قبل)
> فقط در نصب فروشنده کپی می‌شود. در UI هم دکمه‌ی «پنل ساخت لایسنس» در نصب خریدار پنهان می‌شود
> (فیلد `edition` از `GET /api/license`).
> **پیش‌فرض امن برای استقرارهای موجود:** بدون متغیر، `seller` است؛ فقط نصب‌کننده‌ی خریدار
> `buyer` می‌گذارد. برای استقرار داکر مشتری: `-e LICENSE_EDITION=buyer`.

### گام‌های پیاده‌سازی
1. **سرویس‌سازی سرور**: `server/` را با `node-windows` به سرویس ویندوز تبدیل کن (نصب/حذف با `svc install/remove`)؛ پورت پیش‌فرض 4000 با چک اشغال.
2. **Tauri wrapper**: فرانت را در WebView باز کن؛ پس‌زمینه سرور را به‌صورت child process با `tauri-plugin-shell` مدیریت کن (خروج تمیز هنگام بستن اپ → رویداد `ExitRequested`).
3. **نصب‌کننده‌ها**: Tauri bundler با NSIS — دو پروفایل بیلد:
   - مشتری: `TAURI_ENV_*=customer`، نصب سرویس، میان‌بر دسکتاپ، `LICENSE_ENFORCE=1`
   - پشتیبانی: `TAURI_ENV_*=support`، بدون سرویس (اجرای دستی)، `SUPPORT_ONLY=1` + کلید صدور (`keys/license_private.pem` نصب می‌شود) + پنل `/issue`
4. **CI**: job جدید در `docker-publish.yml` یا workflow جدا `windows-build.yml` — خروجی exe در GitHub Release (تگ `win-vX.Y.Z`).
5. **امضا (اختیاری ولی توصیه‌شده)**: گواهی Authenticode (Akcencel/Sectigo) تا SmartScreen هشدار ندهد.

### نکات
- **ورژن‌گذاری**: هر دو بسته از تگ ورژن اصلی می‌آیند (`v1.24.0` → دو artifact)؛ ردیف تگ جدید در DOCKER_HUB_OVERVIEW لازم نیست (خروجی docker جدا از win).
- **اپدیت مشتری**: `tauri-plugin-updater` با endpoint روی GitHub Releases (فقط مشتری؛ پشتیبانی دستی).
- **کلید صدور**: هرگز داخل نصب‌کننده‌ی مشتری نباشد؛ فقط در نصب پشتیبانی و به‌صورت فایل کنار اجرایی (نه embedded).

---

## ۲) اپ اندروید — بارکدخوان سریال

اپ کوچک مکمل (نه جایگزین وب): ورود سریال با دوربین → ثبت در سامانه.

### فناوری پیشنهادی: React Native (سازگار با React موجود) + `vision-camera` + `mlkit barcode`
جایگزین: Flutter (تجربه‌ی بهتر دوربین ولی تیم دوم کد) یا PWA+`BarcodeDetector` (ساده‌ترین، ولی پشتیبانی کروم موبایل محدود).

### قابلیت‌های MVP
- ورود با همان حساب کاربر وب (JWT) — **✅**
- دوربین → شناسایی Code128/QR/Code39 (سریال‌های رایج) → ثبت سریال روی تجهیز/قطعه منتخب — **اسکن/شناسایی ✅ (۱.۲۶)**؛ ثبت سریال جدید ⬜ (انتخاب تجهیز در UI اپ، MVP بعدی)
- حالت آفلاین: صف محلی (AsyncStorage) + همگام‌سازی بعد از اتصال — **✅**
- لاگ فعال‌سازی سرور به‌صورت `source: 'mobile'` — **✅**

> وضعیت پیاده‌سازی (۱.۲۶): اسکلت کامل در `mobile/` — RN 0.73 + vision-camera 4 +
> ناوبری دوصفحه‌ای؛ typecheck سبز؛ endpoint سرور تست شد (401/400/404/جریان موفق
> قطعه و تجهیز + لاگ). بیلد APK در ۱.۳۴.۰ انجام شد.

> **✅ بیلد APK (۱.۳۴.۰)** — پوشه‌ی `mobile/android/` در مخزن است (قالب RN 0.73.11، پکیج `com.supportmobile`).
> دستور: `cd mobile/android && ./gradlew assembleRelease` (خروجی: `mobile/android/app/build/outputs/apk/release/app-release.apk`).
> حجم فایل ساخته‌شده: ۲۵٬۰۵۳٬۴۷۸ بایت (حدود ۲۳.۹ مگابایت) — همه‌ی ABIها (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`).
> امضا: فعلاً با `signingConfigs.debug` (نصب مستقیم روی گوشی کار می‌کند؛ برای Google Play باید keystore واقعی بسازید).
> **پیش‌نیازهای بیلد روی ویندوز (بدون Android Studio):** JDK 21 + `build-tools;33.0.1` + NDK `25.1.8937393` + CMake `3.22.1` زیر `%LOCALAPPDATA%\Android\Sdk`.
> بیلد فقط با این ترکیب سبز شد: AGP `8.5.2`، Kotlin `2.0.21`، و `react-native-screens` پین‌شده روی `3.31.1` (نسخه‌های ۳.۳۷ به بعد `BaseReactPackage` از RN 0.74 می‌خواهند و با RN 0.73 کامپایل نمی‌شوند).
> اپ اندروید **کلاینت است، نه سرور**: آدرس سرور را در صفحه‌ی ورود می‌گیرد (`DEFAULT_SERVER_URL` در `mobile/src/config.ts`، پیش‌فرض شبیه‌ساز `http://10.0.2.2:4000`).

### گام‌ها
1. ~~ریپوی جدا `Support-Mobile`~~ → **انجام شد (۱.۲۶)**: پوشه‌ی `mobile/` داخل همین مخزن (جدا کردن ریپو در صورت نیاز آینده)
2. **✅ انجام شد**: `POST /api/serial-import/mobile` (فایل: `server/src/routes/serialImportMobile.ts`) — همان JWT وب، نقش‌های admin/warehouse/tech؛ جست‌وجوی سریال قطعه/تجهیز + ثبت log با `source: 'mobile'` (جدول `mobile_scan_log`)؛ `GET …/mobile/logs` برای پیگیری
3. **✅ بیلد APK انجام شد (۱.۳۴.۰)** با `./gradlew assembleRelease`؛ توزیع: مستقیم (APK) یا Google Play (بعد از پولیش)

### مراحل بعد از MVP
- تایپ سریال دستی + جست‌وجوی سریع
- تصویر از برچسب/جعبه (Upload endpoint موجود `/api/devices/:id/parts-grid` گسترش یابد)

---

## ۳) چک‌لیست هر ریلیز بسته‌بندی

- [ ] نسخه در هر سه `package.json` + lock یکسان
- [ ] ردیف تاریخچه‌ی README و Overview (برای ریلیزهای عمومی — مشتری و اندروید)
- [ ] تگ `vX.Y.Z` پابلیش داکر؛ تگ `win-vX.Y.Z` بیلد ویندوز؛ APK در Release گیت‌هاب
- [ ] `cd desktop && npm run build:customer` و `npm run build:support` (دو نصب‌کننده‌ی خریدار/فروشنده)
- [ ] `cd mobile/android && ./gradlew assembleRelease` (APK) + تست نصب روی گوشی واقعی
- [ ] `SUPPORT_ONLY=1` در نصب پشتیبانی تست شود (403 روی `/api/devices`)
- [ ] نصب تازه‌ی مشتری: فعال‌سازی با کد لایسنس واقعی از `/issue` سرور پشتیبانی
- [ ] smoke: `npm run test:smoke:full -- --plan month` (معادل `node scripts/smoke-test.mjs --issue --plan month`) روی هر دو نصب
- [ ] لاگ سرور: `npm run test:logs` سبز باشد — endpoint `GET /api/logs` در هر دو حالت سرور (۲۷ چک)
- [ ] نگهداشت بکاپ: `npm run test:retention` سبز باشد
- [ ] درفت اسکیما: `npm run check:schema` سبز باشد — هر ستونِ COLUMN_MIGRATIONS در schema.sql هم هست (رگرسیون catalog_id)
