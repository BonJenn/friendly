import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { fbMessaging } from './firebase';
import { Platform } from 'react-native';
import { updateProfile } from './api';

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const isCall = data?.type === 'incoming_call';

    return {
      shouldShowAlert: true,
      shouldPlaySound: isCall,
      shouldSetBadge: false,
    };
  },
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Get FCM token
  const fcmToken = await fbMessaging.getToken();

  // Save to user profile
  await updateProfile({ fcmToken }).catch(() => {
    // Silently fail - token will be saved on next opportunity
  });

  // iOS: request APNs permission
  if (Platform.OS === 'ios') {
    const authStatus = await fbMessaging.requestPermission();
    console.log('APNs authorization status:', authStatus);
  }

  return fcmToken;
}

export function onNotificationReceived(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

export function onNotificationResponse(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// Handle FCM background messages
export function setupBackgroundMessageHandler(): void {
  fbMessaging.setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('Background message:', remoteMessage.messageId);
    // The notification display is handled by FCM automatically
  });
}
