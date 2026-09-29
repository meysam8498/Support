---
version: alpha
name: PipelinePro Support
description: سامانه‌ی مدیریت تجهیزات و قطعات یدکی — زبان طراحی PipelinePro با تطبیق RTL فارسی
omitted:
  - Shapes
colors:
  primary: "#4F46E5"
  primary-hover: "#4338CA"
  primary-active: "#3730A3"
  primary-soft: "#EEF2FF"
  secondary: "#06B6D4"
  tertiary: "#F97316"
  background: "#FAFAFA"
  surface: "#FFFFFF"
  border: "#E4E4E7"
  border-strong: "#D4D4D8"
  ink: "#18181B"
  muted: "#71717A"
  faint: "#A1A1AA"
  success: "#22C55E"
  success-soft: "#F0FDF4"
  warning: "#F59E0B"
  error: "#EF4444"
typography:
  display:
    fontFamily: Outfit
    fontSize: 52px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0.02em
  headline:
    fontFamily: Outfit
    fontSize: 38px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.015em
  subhead:
    fontFamily: Outfit
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.01em
  overline:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.09em
  code:
    fontFamily: Source Code Pro
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 20px
  full: 9999px
spacing:
  base: 4px
  scale: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: 8px 18px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  button-ghost-hover:
    backgroundColor: "#F4F4F5"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: 38px
---

# PipelinePro Support — زبان طراحی سامانه

سامانه‌ی مدیریت تجهیزات و قطعات یدکی با زبان طراحی **PipelinePro** پیاده شده است:
ساختارمند، مطمئن و داده‌محور. لنگر اصلی رنگ، **ایندیگو** (#4F46E5) است؛ فیروزه‌ای
(#06B6D4) برای لینک/هایلایت ثانویه و نارنجی (#F97316) فقط برای فوریت (نزدیک به سقف،
هشدار پیش از انقضا). چگالی استاندارد با واحد پایه‌ی ۴px — فشرده برای نمای داده‌ای،
خوانا برای استفاده‌ی طولانی. RTL فارسی با فونت Vazirmatn و اعداد نمایشی Outfit.

## تطبیق RTL فارسی
- فونت‌ها: `Outfit` (نمایشی/اعداد لاتین) · `Inter` (لاتین) · `Vazirmatn` (متن فارسی) · `Source Code Pro` (کد/شناسه‌ها)
- نوارهای رنگی کارت و حاشیه‌ی انتخاب، **سمت راست** است (آینه‌ی چپ‌به‌راست)
- اعداد رابط با `font-variant-numeric: tabular-nums` و ترجیحاً ارقام فارسی

## نقشه‌ی کلاس‌های موجود (سازگاری معکوس)
- `brand-*` ← ایندیگو (primary) — همان نام کلاس، رنگ جدید
- `gold-*` ← نارنجی فوریت (tertiary #F97316)
- `coral-*` ← قرمز خطا (#EF4444) · `sky-*` ← فیروزه‌ای (secondary #06B6D4)
- `surface-base/base #FAFAFA` · `surface-card` سفید خالص (در این تم، کارت‌ها سفید بر بستر #FAFAFA)

## Do's and Don'ts
- Do ایندیگو را برای اقدامات اصلی و وضعیت فعال یکدست نگه دار (منوی بالا، دکمه‌ی primary)
- Do نزدیکی به سقف/انقضا را با نارنجی نشان بده، هرگز با قرمز — قرمز فقط خطای واقعی
- Don't انیمیشن کارت‌ها را از 200ms بلندتر نکن — سرعت، حس اعتماد می‌دهد
- Don't بیش از یک دکمه‌ی primary در هر نما
- Do مقادیر عددی را با قالب ارز/عدد درست (locale-aware) نمایش بده
