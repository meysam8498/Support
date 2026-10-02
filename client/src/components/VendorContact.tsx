// ============================================================
// «تماس با فروشنده برای ارتقا» — markup واحد (جمله + mailto + dir=ltr)
// منبع متن و ایمیل: lib/upgrade.ts
// استفاده: <VendorContact /> یا <VendorContact prefix=" " suffix="." />
// طراح و توسعه‌دهنده: میثم ایجادی / Meysam Ijadi — M.Ijadi@Hotmail.com
// ============================================================
import React from 'react';
import { VENDOR_CONTACT_TEXT, VENDOR_EMAIL } from '../lib/upgrade';

interface VendorContactProps {
  /** پیشوند (جداکننده) — پیش‌فرض « — » مطابق بنرها */
  prefix?: string;
  /** پسوند (مثلاً نقطه‌ی پایان جمله) */
  suffix?: string;
}

export default function VendorContact({ prefix = ' — ', suffix = '' }: VendorContactProps) {
  return (
    <>
      {prefix}
      {VENDOR_CONTACT_TEXT}:{' '}
      <a href={`mailto:${VENDOR_EMAIL}`} className="underline font-semibold" dir="ltr">
        {VENDOR_EMAIL}
      </a>
      {suffix}
    </>
  );
}
