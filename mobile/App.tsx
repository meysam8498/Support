// اپ اصلی — ناوبری دوصفحه‌ای لاگین/اسکنر + وضعیت نشست + همگام‌سازی صف آفلاین
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getToken, logout, getServerUrl } from './src/api';
import { syncQueue } from './src/queue';
import LoginScreen from './src/screens/LoginScreen';
import ScannerScreen from './src/screens/ScannerScreen';

export type RootStackParamList = {
  Login: undefined;
  Scanner: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setSignedIn(!!token);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    (async () => {
      const serverUrl = await getServerUrl();
      const token = await getToken();
      if (token) {
        const n = await syncQueue(serverUrl, token);
        if (n > 0) console.log(`[mobile] ${n} اسکن صف‌شده ثبت شد.`);
      }
    })();
  }, [signedIn]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e1b4b' }}>
        <ActivityIndicator color="#818cf8" size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" />
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#1e1b4b' } }}>
        {signedIn ? (
          <Stack.Screen name="Scanner">
            {(props) => <ScannerScreen {...props} onLogout={() => logout().then(() => setSignedIn(false))} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Login">
            {(props) => <LoginScreen {...props} onLoggedIn={() => setSignedIn(true)} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
