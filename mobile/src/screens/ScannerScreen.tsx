// صفحه‌ی بارکدخوان — دوربین با vision-camera + تشخیص Code128/QR/Code39 و ارسال به سرور
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
  type CodeType,
} from 'react-native-vision-camera';
import { sendScan, type ScanResponse } from '../api';

const CODE_TYPES: CodeType[] = ['code-128', 'qr', 'code-39', 'ean-13'];

export default function ScannerScreen({ onLogout }: { onLogout: () => void }) {
  const device = useCameraDevice('back');
  const [permission, setPermission] = useState<boolean | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [lastSerial, setLastSerial] = useState<string | null>(null);
  const busyUntil = useRef(0); // ضداسکن مضاعف: بین دو ارسال حداقل ۱.۵ ثانیه

  React.useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setPermission(status === 'granted');
    })();
  }, []);

  const handleCode = useCallback(async (codes: { value?: string }[]) => {
    const value = codes[0]?.value;
    if (!value) return;
    const now = Date.now();
    if (now < busyUntil.current) return;
    busyUntil.current = now + 1500;
    setLastSerial(value);
    setResult(null);
    const res = await sendScan(value);
    setResult(res);
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: CODE_TYPES,
    onCodeScanned: handleCode,
  });

  if (permission === null || permission === false) {
    return (
      <View style={[s.center, s.root]}>
        <Text style={s.emoji}>📷</Text>
        <Text style={s.msg}>
          {permission === false
            ? 'دسترسی دوربین داده نشده است — از تنظیمات اندروید فعالش کنید.'
            : 'در حال گرفتن دسترسی دوربین…'}
        </Text>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={[s.center, s.root]}>
        <Text style={s.emoji}>📷</Text>
        <Text style={s.msg}>دوربینی پیدا نشد.</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive photo codeScanner={codeScanner} />

      {/* قاب راهنما */}
      <View style={s.frameWrap} pointerEvents="none">
        <View style={s.frame} />
      </View>

      <View style={s.hud}>
        <Text style={s.hudTitle}>بارکد را در قاب بگیرید</Text>
        <Text style={s.hudSub}>Code128 · QR · Code39 · EAN-13</Text>
        {lastSerial ? <Text style={s.serial}>آخرین اسکن: {lastSerial}</Text> : null}
        {result ? (
          <View style={[s.card, result.found ? s.cardOk : s.cardErr]}>
            <Text style={s.cardTitle}>
              {result.found
                ? result.match?.kind === 'part'
                  ? `✅ قطعه: ${result.match.part?.title}`
                  : '✅ تجهیز پیدا شد'
                : `❌ ${result.error ?? 'پیدا نشد'}`}
            </Text>
            {result.found && result.match ? (
              <Text style={s.cardBody}>
                {result.match.kind === 'part'
                  ? `سریال: ${result.match.part?.serial ?? '—'}\nتجهیز: ${result.match.device?.main_serial ?? '—'}\nپروژه: ${result.match.project?.name ?? '—'}`
                  : `سریال تجهیز: ${result.match.device?.main_serial ?? '—'}\nپروژه: ${result.match.project?.name ?? '—'}`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <TouchableOpacity style={s.logout} onPress={onLogout}>
        <Text style={s.logoutText}>خروج</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  emoji: { fontSize: 44, marginBottom: 12 },
  msg: { color: '#cbd5e1', textAlign: 'center', fontSize: 15, lineHeight: 24 },
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 280,
    height: 160,
    borderWidth: 2,
    borderColor: '#818cf8',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hud: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  hudTitle: { color: '#e0e7ff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  hudSub: { color: '#818cf8', fontSize: 11, textAlign: 'center', marginTop: 2 },
  serial: { color: '#a5b4fc', fontSize: 12, textAlign: 'center', marginTop: 8 },
  card: { marginTop: 10, borderRadius: 10, padding: 12 },
  cardOk: { backgroundColor: '#14532d' },
  cardErr: { backgroundColor: '#7f1d1d' },
  cardTitle: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  cardBody: { color: '#cbd5e1', fontSize: 12, marginTop: 4, lineHeight: 19 },
  logout: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: 'rgba(30, 27, 75, 0.85)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  logoutText: { color: '#c7d2fe', fontSize: 13 },
});
