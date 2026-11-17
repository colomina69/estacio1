import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { AlertEvent } from '@/types/weather';

export const ALERT_CHANNEL_ID = 'alertas-meteo';

/**
 * Expo Go (Android, SDK 53+) no admite el canal de notificaciones nativo de forma fiable:
 * su módulo ExpoNotificationChannelManager falla con NullPointerException. Solo se usa en development builds.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient' && Constants.appOwnership === 'expo';
}

/** Configura el manejador de notificaciones en primer plano y el canal de Android. Nunca lanza. */
export async function setupNotifications(): Promise<void> {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android' && !isExpoGo()) {
      await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
        name: 'Alertas meteorológicas',
        importance: AndroidImportance.DEFAULT,
      });
    }
  } catch {
    // Las notificaciones son opcionales: un fallo no debe tumbar la app.
  }
}

/** Pide permiso de notificaciones. Devuelve true si está concedido. */
export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/** Muestra una notificación local inmediata (RF-24). */
export async function sendLocalAlert(event: AlertEvent): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Aviso meteorológico', body: event.message },
      trigger: null,
    });
  } catch {
    // Las notificaciones son best-effort: un fallo no debe romper el procesamiento de mensajes.
  }
}
