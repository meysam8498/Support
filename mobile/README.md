# 📱 Support Mobile — اپ بارکدخوان سریال

اپ مکمل وب — ورود سریال با دوربین و ثبت در سامانه (PACKAGING.md بخش ۲).
ری‌اکت نیتیو + `react-native-vision-camera` (تشخیص Code128/QR/Code39/EAN-13).

## راه‌اندازی سریع

```bash
cd mobile
npm install
npm run android   # شبیه‌ساز/دستگاه اندروید متصل
```

- **شبیه‌ساز**: سرور پیش‌فرض `http://10.0.2.2:4000` است (لوکال‌هاست میزبان).
- **دستگاه واقعی**: در صفحه‌ی لاگین، IP سیستمِ نصب‌شده‌ی سرور را بدهید (مثلاً `http://192.168.1.10:4000`) — سرور باید در دسترس شبکه‌ی موبایل باشد.
- ورود با **همان حساب وب** (نقش‌های مجاز: admin/warehouse/tech).

## مجوز دوربین

اولین اجرا دسترسی دوربین می‌خواهد. برای بیلد اندروید، این مجوز در `AndroidManifest.xml` لازم است
(پس از `npm run android` اول، در `mobile/android/` ساخته می‌شود):

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

و برای vision-camera روی minSdk 21+ مطمئن شوید (پیش‌فرض RN 0.73 OK).

## معماری

```
mobile/
├── App.tsx                     # ناوبری شرطی لاگین/اسکنر + همگام‌سازی صف پس از ورود
├── src/
│   ├── config.ts               # آدرس سرور پیش‌فرض + کلیدهای AsyncStorage
│   ├── api.ts                  # login/sendScan با پیام‌های فارسی + 401 → خروج
│   ├── queue.ts                # صف آفلاین (AsyncStorage) + syncQueue پس از اتصال
│   └── screens/
│       ├── LoginScreen.tsx     # آدرس سرور + ورود
│       └── ScannerScreen.tsx   # دوربین + قاب راهنما + HUD نتیجه
```

- **آفلاین-اول**: اگر سرور در دسترس نباشد، اسکن در صف می‌ماند و بعد از اتصال/ورود بعدی خودکار ارسال می‌شود (صف در AsyncStorage).
- **ضداسکن مضاعف**: بین دو ارسال حداقل ۱.۵ ثانیه فاصله.
- سرور: `POST /api/serial-import/mobile` — شناسایی سریال قطعه/تجهیز + ثبت log با `source: 'mobile'` (فایل: [serialImportMobile.ts](../server/src/routes/serialImportMobile.ts)).

## نقشه‌ی بعدی (بعد از MVP)

- انتخاب تجهیز/پروژه در اپ + ثبت سریال واقعی جدید (فعلاً فقط شناسایی + log)
- تایپ دستی سریال + جست‌وجوی سریع
- تصویر از برچسب/جعبه (Upload endpoint موجود `/api/devices/:id/parts-grid` گسترش یابد)
- بیلد APK توزیع (`react-native build-android`) و انتشار در Release گیت‌هاب
