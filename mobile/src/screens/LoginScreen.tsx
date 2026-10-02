// صفحه‌ی ورود — آدرس سرور + نام کاربری/رمز (همان حساب وب)
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { login, getServerUrl } from '../api';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    getServerUrl().then(setServerUrl);
  }, []);

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('نام کاربری و رمز عبور الزامی است.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await login(serverUrl, username, password);
    setBusy(false);
    if (res.ok) onLoggedIn();
    else setError(res.error ?? 'ورود ناموفق بود.');
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>📦</Text>
        <Text style={s.title}>مدیریت تجهیزات</Text>
        <Text style={s.subtitle}>ورود بارکدخوان سریال</Text>

        <Text style={s.label}>آدرس سرور</Text>
        <TextInput
          style={s.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.1.10:4000"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"

        />

        <Text style={s.label}>نام کاربری</Text>
        <TextInput
          style={s.input}
          value={username}
          onChangeText={setUsername}
          placeholder="admin"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"

        />

        <Text style={s.label}>رمز عبور</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#94a3b8"
          secureTextEntry

        />

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity style={[s.btn, busy && s.btnBusy]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>ورود</Text>}
        </TouchableOpacity>

        <Text style={s.hint}>روی دستگاه واقعی، IP سیستمِ نصب‌شده‌ی سرور را وارد کنید.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1e1b4b' },
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  logo: { fontSize: 44, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#e0e7ff', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#a5b4fc', textAlign: 'center', marginBottom: 28 },
  label: { fontSize: 13, color: '#c7d2fe', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#312e81',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#e0e7ff',
    fontSize: 15,
  },
  error: {
    marginTop: 14,
    color: '#fecaca',
    backgroundColor: '#7f1d1d',
    padding: 10,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 13,
  },
  btn: {
    marginTop: 22,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnBusy: { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { marginTop: 18, color: '#818cf8', fontSize: 12, textAlign: 'center', lineHeight: 19 },
});
