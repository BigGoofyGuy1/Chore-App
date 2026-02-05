import * as Haptics from 'expo-haptics';

export const sendPushNotification = async (targetToken: string, title: string, body: string) => {
  if (!targetToken) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: targetToken, sound: 'default', title, body }),
  });
};

export const triggerHapticSuccess = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};