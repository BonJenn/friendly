import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { UserProvider } from '@/context/UserContext';
import { RootNavigator } from '@/navigation/RootNavigator';
import {
  registerForPushNotifications,
  onNotificationResponse,
  setupBackgroundMessageHandler,
} from '@/services/notifications';
import { initPurchases } from '@/services/purchases';
import { colors } from '@/config/theme';

// Set up background message handler outside of component tree
setupBackgroundMessageHandler();

function AppInner() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Initialize RevenueCat
    initPurchases(user.uid);

    // Register for push notifications
    registerForPushNotifications();

    // Handle notification taps (e.g., incoming call)
    const sub = onNotificationResponse((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'incoming_call') {
        // Navigation to call screen is handled by deep linking
        // The notification contains the call session ID
        console.log('Incoming call tapped:', data.callSessionId);
      }
    });

    return () => sub.remove();
  }, [user]);

  return (
    <UserProvider>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: colors.primary,
            background: colors.bg,
            card: colors.bgCard,
            text: colors.textPrimary,
            border: colors.border,
            notification: colors.primary,
          },
          fonts: {
            regular: { fontFamily: 'System', fontWeight: '400' },
            medium: { fontFamily: 'System', fontWeight: '500' },
            bold: { fontFamily: 'System', fontWeight: '700' },
            heavy: { fontFamily: 'System', fontWeight: '800' },
          },
        }}
      >
        <RootNavigator />
      </NavigationContainer>
    </UserProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <AppInner />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
