import React, { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import { loadStoredAuthThunk } from './src/store/authSlice';
import {
  requestNotificationPermission,
  registerFCMToken,
  setupBackgroundHandler,
  setupForegroundHandler,
} from './src/services/notificationService';
import { Alert } from 'react-native';

// ── Setup Firebase background handler (outside component) ─────────────────
setupBackgroundHandler();

// ── Inner app: bootstraps auth + notifications ────────────────────────────
function AppInner() {
  const dispatch = useDispatch();

  useEffect(() => {
    // 1. Try to restore stored session
    dispatch(loadStoredAuthThunk());

    // 2. Request & register push notification token
    (async () => {
      const granted = await requestNotificationPermission();
      if (granted) await registerFCMToken();
    })();

    // 3. Handle foreground notifications as in-app alerts
    const unsubscribe = setupForegroundHandler(({ title, body }) => {
      if (title) Alert.alert(title, body);
    });

    return unsubscribe;
  }, []);

  return <AppNavigator />;
}

// ── Root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Provider store={store}>
          <AppInner />
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
