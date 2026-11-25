import { initializeApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getToken, isSupported, getMessaging, onMessage, type MessagePayload } from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
// In the Capacitor iOS wrapper (WKWebView), getAuth() registers the popup/redirect resolver,
// which loads a hidden auth iframe from authDomain on startup. That iframe never finishes
// under capacitor://localhost, so onAuthStateChanged never fires and the app spins forever.
// On native, initialize auth without any popup/redirect resolver. The app signs in
// anonymously, so no resolver is needed.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    })
  : getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function registerWebPushNotifications(vapidKey?: string): Promise<{
  permission: NotificationPermission | 'unsupported';
  fcmToken: string;
  note: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      permission: 'unsupported',
      fcmToken: '',
      note: 'This browser does not support Web Notifications.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      permission,
      fcmToken: '',
      note: 'Notification permission was not granted.',
    };
  }

  try {
    const messagingSupported = await isSupported();
    if (!messagingSupported || !('serviceWorker' in navigator)) {
      return {
        permission,
        fcmToken: '',
        note: 'Browser notifications enabled (FCM background worker unavailable in this context).',
      };
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope',
    });

    const messaging = getMessaging(app);
    const trimmedVapid = vapidKey?.trim() || import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
    if (!trimmedVapid) {
      return {
        permission,
        fcmToken: '',
        note: 'Browser notifications enabled. Add a Web Push VAPID key in Push Settings to generate a background FCM token.',
      };
    }

    const token = await getToken(messaging, {
      vapidKey: trimmedVapid,
      serviceWorkerRegistration: registration,
    });

    return {
      permission,
      fcmToken: token || '',
      note: token
        ? 'FCM background push token registered.'
        : 'Notification permission active; FCM token could not be issued.',
    };
  } catch (err) {
    return {
      permission,
      fcmToken: '',
      note:
        err instanceof Error
          ? `Browser notifications enabled (FCM setup note: ${err.message}).`
          : 'Browser notifications enabled.',
    };
  }
}

export async function subscribeForegroundFcm(
  onPayload: (payload: MessagePayload) => void
): Promise<() => void> {
  try {
    const supported = await isSupported();
    if (!supported) return () => {};
    const messaging = getMessaging(app);
    return onMessage(messaging, onPayload);
  } catch {
    return () => {};
  }
}

export async function showPartnerSystemNotification(title: string, body: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'tether-partner-ping',
        });
        return;
      }
    }
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      tag: 'tether-partner-ping',
    });
  } catch {
    // Notification display may be blocked in embedded iframes; in-app banner & chime remain active.
  }
}
