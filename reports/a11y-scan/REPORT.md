# گزارش اسکن زنده‌ی دسترس‌پذیری (axe — مرورگر واقعی)

- **زمان اجرا:** 2026-10-28 04:57:08 · **نسخه‌ی اپ:** 1.28.0 · **axe:** 4.14.0 · **مرورگر:** Chrome/155.0.8059.82
- **سرور:** http://localhost:4100 · **کلاینت:** http://localhost:4100 · **تم‌ها:** light، dark · **عرض‌ها:** 390px
- **صفحات:** 23 × تم × عرض = 46 اسکن · **بدون نقض:** 2 · **با مشکل:** 44
- **محدودیت نرخ (نویزِ سرعتِ اسکن، عیب اپ نیست):** 38 پاسخ 429 روی /api/license — سرور licenseLimiter دارد (۳۰ درخواست/دقیقه به ازای هر IP). برای حذفِ کامل، اجرا را با --delay بزرگ‌تر تکرار کنید.

| صفحه | تم | عرض | نقض axe | خطای JS | خطای شبکه | سرریز افقی |
|---|---|---|---|---|---|---|
| ورود (`/login`) | light | 390 | ✓ | ✓ | ✓ | ✓ |
| داشبورد (`/`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| فهرست تجهیزات (`/devices`) | light | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| ثبت تجهیز جدید (`/devices/new`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| جزئیات تجهیز (`/devices/1`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| ویرایش تجهیز (`/devices/1/edit`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| گرید قطعات تجهیز (`/devices/1/parts-grid`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| فهرست قطعات (`/parts`) | light | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| ثبت قطعه جدید (`/parts/new`) | light | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| جزئیات قطعه (`/parts/1`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| ویرایش قطعه (`/parts/1/edit`) | light | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| تعویض‌های گارانتی (`/warranty`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| ثبت تعویض گارانتی (`/warranty/replace`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| گزارش‌ها (`/reports`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| مدیریت لیست‌ها (`/lists`) | light | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| ورود سریال از اکسل (`/serial-import`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| مدیریت کاربران (`/users`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| مدیریت بکاپ‌ها (`/backups`) | light | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| وضعیت لایسنس (`/license`) | light | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| پنل ساخت لایسنس (`/issue`) | light | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| درباره سامانه (`/about`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| لاگ سرور (`/logs`) | light | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| نمای مشتری (`/dashboard/customer/1`) | light | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| ورود (`/login`) | dark | 390 | ✓ | ✓ | ✓ | ✓ |
| داشبورد (`/`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| فهرست تجهیزات (`/devices`) | dark | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| ثبت تجهیز جدید (`/devices/new`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| جزئیات تجهیز (`/devices/1`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| ویرایش تجهیز (`/devices/1/edit`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| گرید قطعات تجهیز (`/devices/1/parts-grid`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| فهرست قطعات (`/parts`) | dark | 390 | ❌ 2 | ✓ | ✓ | ✓ |
| ثبت قطعه جدید (`/parts/new`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| جزئیات قطعه (`/parts/1`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| ویرایش قطعه (`/parts/1/edit`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| تعویض‌های گارانتی (`/warranty`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| ثبت تعویض گارانتی (`/warranty/replace`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| گزارش‌ها (`/reports`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| مدیریت لیست‌ها (`/lists`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| ورود سریال از اکسل (`/serial-import`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| مدیریت کاربران (`/users`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| مدیریت بکاپ‌ها (`/backups`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| وضعیت لایسنس (`/license`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| پنل ساخت لایسنس (`/issue`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| درباره سامانه (`/about`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| لاگ سرور (`/logs`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |
| نمای مشتری (`/dashboard/customer/1`) | dark | 390 | ❌ 1 | ✓ | ✓ | ✓ |

## جزئیات مشکلات

### داشبورد (`/`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### فهرست تجهیزات (`/devices`) — light/390px
- **color-contrast** [serious] ×5: Elements must meet minimum color contrast ratio thresholds
  - `.chip-active > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۱)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(2) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۱)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(3) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(4) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(5) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ثبت تجهیز جدید (`/devices/new`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### جزئیات تجهیز (`/devices/1`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ویرایش تجهیز (`/devices/1/edit`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### گرید قطعات تجهیز (`/devices/1/parts-grid`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### فهرست قطعات (`/parts`) — light/390px
- **color-contrast** [serious] ×4: Elements must meet minimum color contrast ratio thresholds
  - `.chip-active > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۱)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(2) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۱)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(3) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(4) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ثبت قطعه جدید (`/parts/new`) — light/390px
- **color-contrast** [serious] ×1: Elements must meet minimum color contrast ratio thresholds
  - `label > .text-\[10px\].text-stone-400` — <span class="text-[10px] text-stone-400">(از کاتالوگ — عنوان و مشخصات خودکار پر می‌شود)</span>
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### جزئیات قطعه (`/parts/1`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ویرایش قطعه (`/parts/1/edit`) — light/390px
- **color-contrast** [serious] ×1: Elements must meet minimum color contrast ratio thresholds
  - `label > .text-stone-400.text-\[10px\]` — <span class="text-[10px] text-stone-400">(از کاتالوگ — عنوان و مشخصات خودکار پر می‌شود)</span>
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### تعویض‌های گارانتی (`/warranty`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ثبت تعویض گارانتی (`/warranty/replace`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### گزارش‌ها (`/reports`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### مدیریت لیست‌ها (`/lists`) — light/390px
- **color-contrast** [serious] ×1: Elements must meet minimum color contrast ratio thresholds
  - `.bg-gold\/15` — <button class="px-3 py-1.5 rounded-lg text-sm transition bg-gold/15 text-[#8a6d00] dark:text-gold-light border border-gold/40 hover:bg-gold/25" title="تعریف مرج
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ورود سریال از اکسل (`/serial-import`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### مدیریت کاربران (`/users`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### مدیریت بکاپ‌ها (`/backups`) — light/390px
- **color-contrast** [serious] ×6: Elements must meet minimum color contrast ratio thresholds
  - `.p-2\.5.bg-surface-raised.dark\:bg-stone-800\/60:nth-child(1) > .mb-0\.5.text-stone-500.dark\:text-stone-400` — <p class="text-stone-500 dark:text-stone-400 mb-0.5">زمان‌بندی</p>
  - `.p-2\.5.bg-surface-raised.dark\:bg-stone-800\/60:nth-child(2) > .mb-0\.5.text-stone-500.dark\:text-stone-400` — <p class="text-stone-500 dark:text-stone-400 mb-0.5">نگهداری</p>
  - `.p-2\.5.bg-surface-raised.dark\:bg-stone-800\/60:nth-child(3) > .mb-0\.5.text-stone-500.dark\:text-stone-400` — <p class="text-stone-500 dark:text-stone-400 mb-0.5">آخرین اجرا</p>
  - `.p-2\.5.bg-surface-raised.dark\:bg-stone-800\/60:nth-child(4) > .mb-0\.5.text-stone-500.dark\:text-stone-400` — <p class="text-stone-500 dark:text-stone-400 mb-0.5">Push خارجی</p>
  - `.p-2\.5.bg-surface-raised.dark\:bg-stone-800\/60:nth-child(4) > .text-stone-500.dark\:text-stone-400:nth-child(2)` — <p class="text-stone-500 dark:text-stone-400">غیرفعال (BACKUP_PUSH_TARGET تنظیم نشده)</p>
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### وضعیت لایسنس (`/license`) — light/390px
- **color-contrast** [serious] ×3: Elements must meet minimum color contrast ratio thresholds
  - `.text-coral` — <p class="text-coral text-sm">درخواست زیاد روی لایسنس — یک دقیقه صبر کنید.</p>
  - `.mb-3` — <p class="text-xs text-stone-400 mb-3 leading-6">کد فعال‌سازی دریافتی از فروشنده را وارد کنید. اعتبارسنجی کاملاً محلی و آفلاین است (تأیید امضا با کلید عمومی داخ
  - `.form-banner-error > .min-w-0` — <span class="min-w-0">درخواست زیاد روی لایسنس — یک دقیقه صبر کنید.</span>
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### پنل ساخت لایسنس (`/issue`) — light/390px
- **color-contrast** [serious] ×1: Elements must meet minimum color contrast ratio thresholds
  - `.mb-4` — <p class="text-xs text-stone-400 mb-4 leading-6">
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### درباره سامانه (`/about`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### لاگ سرور (`/logs`) — light/390px
- **color-contrast** [serious] ×5: Elements must meet minimum color contrast ratio thresholds
  - `.flex-wrap.gap-2.text-xs > .text-stone-400.fa-nums` — <span class="text-stone-400 fa-nums">آخرین خواندن: ۱۴۰۵/۸/۶ ۰۸:۲۵:۵۶</span>
  - `.chip-default.chip[type="button"]:nth-child(2) > .opacity-80.fa-nums` — <span class="fa-nums opacity-80">(۴)</span>
  - `.chip-default.chip[type="button"]:nth-child(3) > .opacity-80.fa-nums` — <span class="fa-nums opacity-80">(۰)</span>
  - `span[title="2026-10-28T04:45:44.491Z"]` — <span class="shrink-0 text-stone-400 fa-nums" title="2026-10-28T04:45:44.491Z">۱۴۰۵/۸/۶ ۰۸:۱۵:۴۴</span>
  - `span[title="2026-10-28T04:45:44.500Z"]` — <span class="shrink-0 text-stone-400 fa-nums" title="2026-10-28T04:45:44.500Z">۱۴۰۵/۸/۶ ۰۸:۱۵:۴۴</span>
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### نمای مشتری (`/dashboard/customer/1`) — light/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### داشبورد (`/`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### فهرست تجهیزات (`/devices`) — dark/390px
- **color-contrast** [serious] ×5: Elements must meet minimum color contrast ratio thresholds
  - `.chip-active > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۱)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(2) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۱)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(3) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(4) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(5) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ثبت تجهیز جدید (`/devices/new`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### جزئیات تجهیز (`/devices/1`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ویرایش تجهیز (`/devices/1/edit`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### گرید قطعات تجهیز (`/devices/1/parts-grid`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### فهرست قطعات (`/parts`) — dark/390px
- **color-contrast** [serious] ×4: Elements must meet minimum color contrast ratio thresholds
  - `.chip-active > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۱)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(2) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۱)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(3) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - `.chip-default.dark\:hover\:bg-stone-700.chip:nth-child(4) > .opacity-70.fa-nums` — <span class="fa-nums opacity-70">(۰)</span>
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=axeAPI
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ثبت قطعه جدید (`/parts/new`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### جزئیات قطعه (`/parts/1`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ویرایش قطعه (`/parts/1/edit`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### تعویض‌های گارانتی (`/warranty`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ثبت تعویض گارانتی (`/warranty/replace`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### گزارش‌ها (`/reports`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### مدیریت لیست‌ها (`/lists`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border-transparent` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### ورود سریال از اکسل (`/serial-import`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### مدیریت کاربران (`/users`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### مدیریت بکاپ‌ها (`/backups`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.border` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### وضعیت لایسنس (`/license`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### پنل ساخت لایسنس (`/issue`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### درباره سامانه (`/about`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### لاگ سرور (`/logs`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

### نمای مشتری (`/dashboard/customer/1`) — dark/390px
- **label-content-name-mismatch** [serious] ×1: Elements must have their visible text as part of their accessible name
  - `.px-2` — <button class="flex items-center gap-2 h-9 px-2 rounded-lg border transition-colors duration-150 border-transparent hover:bg-surface-raised dark:hover:bg-white/
  - راهنما: https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=axeAPI

