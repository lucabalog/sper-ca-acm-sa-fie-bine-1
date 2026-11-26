import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  showPartnerSystemNotification,
  subscribeForegroundFcm,
} from './firebase';
import type {
  AspectRatioOption,
  AutoDeleteDuration,
  PairDeviceDoc,
  PairDoc,
  PairingCodeDoc,
  PingDoc,
  StudioThemePrefs,
  UserProfile,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NameSetupView } from './components/NameSetupView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PairedStudio } from './components/PairedStudio';
import { PairingView } from './components/PairingView';
import { WidgetStandaloneView } from './components/WidgetStandaloneView';
import { playWarmChime } from './utils/chime';
import { triggerHaptic } from './utils/haptics';
import {
  loadThemePrefs,
  normalPingMessage,
  resolveAmbientPalette,
  saveThemePrefs,
} from './utils/themeColors';
import {
  devicePlatform,
  getReceiveTopic,
  sendClosedAppPush,
  toDeviceToken,
  topicFromDeviceToken,
} from './utils/closedAppPush';
import { subscribeToWidgetLinks } from './utils/deepLinks';
import { startBackgroundListener, stopBackgroundListener } from './utils/backgroundListener';
import { ensureNativeNotificationPermission } from './utils/nativeNotifications';
import { syncNativeWidgetState } from './utils/widgetBridge';

// Sheets are only needed once opened, so load them on demand to keep startup light
// (the export sheet alone pulls in jszip and ~600 lines of generator templates).
const CustomizeSheet = lazy(() =>
  import('./components/CustomizeSheet').then((m) => ({ default: m.CustomizeSheet }))
);
const NotificationsSheet = lazy(() =>
  import('./components/NotificationsSheet').then((m) => ({ default: m.NotificationsSheet }))
);
const WidgetsSheet = lazy(() =>
  import('./components/WidgetsSheet').then((m) => ({ default: m.WidgetsSheet }))
);
const MobileExportSheet = lazy(() =>
  import('./components/MobileExportSheet').then((m) => ({ default: m.MobileExportSheet }))
);

/** True from the first time `flag` is true; keeps a lazy sheet mounted so its close animation plays. */
function useEverTrue(flag: boolean): boolean {
  const [ever, setEver] = useState(flag);
  if (flag && !ever) setEver(true);
  return ever;
}

// The .ipa/Flutter export tools are for the web version only.
const isNativeApp = Capacitor.isNativePlatform();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePairingCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function generateReverseTimestampId(prefixSeed: string): string {
  const rev = String(9999999999999 - Date.now()).padStart(13, '0');
  const suffix = prefixSeed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'ping';
  const rand = Math.random().toString(36).slice(2, 6);
  return `${rev}_${suffix}_${rand}`;
}

function sanitizePhotoUrl(url: string | null | undefined): string {
  const trimmed = (url ?? '').trim();
  return trimmed.length <= 500 ? trimmed : '';
}

function sanitizeDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed.slice(0, 80) : 'Partner';
}

function TetherWorkspace() {
  const [authReady, setAuthReady] = useState(false);
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pair, setPair] = useState<PairDoc | null>(null);
  // Pair ID whose document has been loaded at least once. Until then a paired user sees the
  // splash instead of a flash of the pairing screen.
  const [pairResolvedId, setPairResolvedId] = useState('');
  const [pings, setPings] = useState<PingDoc[]>([]);
  const [partnerDeviceToken, setPartnerDeviceToken] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pendingCode, setPendingCode] = useState(() => {
    try {
      return localStorage.getItem('tether_pending_code') || '';
    } catch {
      return '';
    }
  });

  const [testMode, setTestMode] = useState(() => {
    try {
      return localStorage.getItem('tether_test_mode') === '1';
    } catch {
      return false;
    }
  });
  const [testPings, setTestPings] = useState<PingDoc[]>([]);
  const [testPingCount, setTestPingCount] = useState(0);

  const [authError, setAuthError] = useState<string | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [sendingPing, setSendingPing] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const [lastSentFeedback, setLastSentFeedback] = useState<string | null>(null);
  const [incomingAlert, setIncomingAlert] = useState<PingDoc | null>(null);

  const [nameConfirmed, setNameConfirmed] = useState(true);

  const [showCustomizeSheet, setShowCustomizeSheet] = useState(false);
  const [showNotificationsSheet, setShowNotificationsSheet] = useState(false);
  const [showWidgetsSheet, setShowWidgetsSheet] = useState(false);
  const [showIpaExportSheet, setShowIpaExportSheet] = useState(false);
  const customizeMounted = useEverTrue(showCustomizeSheet);
  const notificationsMounted = useEverTrue(showNotificationsSheet);
  const widgetsMounted = useEverTrue(showWidgetsSheet);
  const exportMounted = useEverTrue(showIpaExportSheet);
  const [compactWidgetMode, setCompactWidgetMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('widget') === 'compact';
  });
  const [themePrefs, setThemePrefs] = useState<StudioThemePrefs>(() => loadThemePrefs());
  const ambientPalette = useMemo(() => resolveAmbientPalette(themePrefs), [themePrefs]);

  const initialPingsLoadedRef = useRef(false);
  const inFlightPingsRef = useRef(0);
  const lastPairUpdateMsRef = useRef(0);
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const seenPingIdsRef = useRef<Set<string>>(new Set());
  const pingAnchorMsRef = useRef<Map<string, number>>(new Map());
  const deletingPingIdsRef = useRef<Set<string>>(new Set());
  const pendingWidgetActionRef = useRef<'send' | 'priority' | null>(
    typeof window !== 'undefined'
      ? (() => {
          const action = new URLSearchParams(window.location.search).get('widgetAction');
          return action === 'send' || action === 'priority' ? action : null;
        })()
      : null
  );

  const handleUpdateThemePrefs = useCallback((next: StudioThemePrefs) => {
    setThemePrefs(next);
    saveThemePrefs(next);
  }, []);

  const handleChangeAutoDelete = useCallback((seconds: AutoDeleteDuration) => {
    setThemePrefs((prev) => {
      const next = { ...prev, autoDeleteSeconds: seconds };
      saveThemePrefs(next);
      return next;
    });
  }, []);

  const enterTestMode = useCallback(() => {
    setTestMode(true);
    try {
      localStorage.setItem('tether_test_mode', '1');
    } catch {
      // ignore
    }
  }, []);

  const exitTestMode = useCallback(() => {
    setTestMode(false);
    setTestPings([]);
    setIncomingAlert(null);
    setLastSentFeedback(null);
    setPingError(null);
    try {
      localStorage.removeItem('tether_test_mode');
    } catch {
      // ignore
    }
  }, []);

  // 1. Auth State & User Profile Initialization
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // No account needed: give this device an anonymous Firebase identity.
        // It persists across launches, so the device keeps its name and pair.
        setFbUser(null);
        setProfile(null);
        setPair(null);
        setPings([]);
        initialPingsLoadedRef.current = false;
        seenPingIdsRef.current.clear();
        try {
          setAuthError(null);
          await signInAnonymously(auth);
        } catch (err) {
          const code = (err as { code?: string })?.code;
          setAuthError(
            code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed'
              ? 'Anonymous sign-in is turned off for this Firebase project. Enable it in Firebase console → Authentication → Sign-in method → Anonymous.'
              : err instanceof Error
                ? err.message
                : 'Could not connect.'
          );
          setAuthReady(true);
        }
        return;
      }

      setAuthError(null);
      setFbUser(user);
      setAuthReady(true);

      let chosen = false;
      try {
        chosen = localStorage.getItem(`notifye_name_chosen_${user.uid}`) === '1';
      } catch {
        chosen = false;
      }
      setNameConfirmed(chosen);

      const userPath = `users/${user.uid}`;
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const batch = writeBatch(db);
          batch.set(userRef, {
            uid: user.uid,
            displayName: sanitizeDisplayName(user.displayName),
            photoURL: sanitizePhotoUrl(user.photoURL),
            pairId: '',
            partnerUid: '',
            partnerName: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(doc(db, 'users', user.uid, 'private', 'account'), {
            uid: user.uid,
            email: (user.email ?? '').slice(0, 254),
            soundEnabled: true,
            fcmToken: '',
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        }
      } catch (err) {
        setAuthError(
          `Could not set up this device: ${err instanceof Error ? err.message : String(err)}`
        );
        handleFirestoreError(err, OperationType.WRITE, userPath);
      }
    });
    // Safety net: never sit on the loading spinner forever if auth fails to initialize.
    const authTimeout = window.setTimeout(() => {
      if (!auth.currentUser) {
        setAuthError('Connecting is taking longer than expected. Check your internet connection.');
        setAuthReady(true);
      }
    }, 15000);
    return () => {
      window.clearTimeout(authTimeout);
      unsub();
    };
  }, [authAttempt]);

  // 2. Listen to User Profile & Private Preferences
  useEffect(() => {
    if (!authReady || !fbUser) return;

    const userPath = `users/${fbUser.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', fbUser.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, userPath)
    );

    const privatePath = `users/${fbUser.uid}/private/account`;
    const unsubPrivate = onSnapshot(
      doc(db, 'users', fbUser.uid, 'private', 'account'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { soundEnabled?: boolean };
          if (typeof data.soundEnabled === 'boolean') {
            setSoundEnabled(data.soundEnabled);
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, privatePath)
    );

    return () => {
      unsubProfile();
      unsubPrivate();
    };
  }, [authReady, fbUser]);

  // 3. Listen to Active/Waiting Pair Document
  useEffect(() => {
    if (!authReady || !fbUser || !profile?.pairId) {
      setPair(null);
      return;
    }

    const targetPairId = profile.pairId;
    // Never keep the splash up forever (e.g. offline on first launch with nothing cached).
    const resolveTimer = window.setTimeout(() => setPairResolvedId(targetPairId), 6000);
    const pairsQuery = query(
      collection(db, 'pairs'),
      where('memberUids', 'array-contains', fbUser.uid)
    );
    const unsubPair = onSnapshot(
      pairsQuery,
      (snap) => {
        const match = snap.docs.find((d) => d.id === targetPairId);
        // An empty answer from the local cache isn't final; wait for the server.
        if (match || !snap.metadata.fromCache) {
          window.clearTimeout(resolveTimer);
          setPairResolvedId(targetPairId);
        }
        if (!match) {
          setPair(null);
          if (!snap.metadata.fromCache) {
            setPings([]);
            initialPingsLoadedRef.current = false;
            seenPingIdsRef.current.clear();
            try {
              localStorage.removeItem('tether_pending_code');
            } catch {
              // ignore
            }
            setPendingCode('');
            void updateDoc(doc(db, 'users', fbUser.uid), {
              pairId: '',
              partnerUid: '',
              partnerName: '',
              updatedAt: serverTimestamp(),
            }).catch(() => undefined);
          }
          return;
        }
        const pairData = match.data() as PairDoc;
        if (pairData.status === 'unpaired') {
          setPair(null);
          setPings([]);
          initialPingsLoadedRef.current = false;
          seenPingIdsRef.current.clear();
          try {
            localStorage.removeItem('tether_pending_code');
          } catch {
            // ignore
          }
          setPendingCode('');
          void updateDoc(doc(db, 'users', fbUser.uid), {
            pairId: '',
            partnerUid: '',
            partnerName: '',
            updatedAt: serverTimestamp(),
          }).catch(() => undefined);
          return;
        }

        setPair(pairData);

        if (pairData.status === 'active') {
          setTestMode(false);
          try {
            localStorage.removeItem('tether_pending_code');
            localStorage.removeItem('tether_test_mode');
          } catch {
            // ignore
          }
          setPendingCode('');
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pairs')
    );

    return () => {
      window.clearTimeout(resolveTimer);
      unsubPair();
    };
  }, [authReady, fbUser, profile?.pairId]);

  // 4. Listen to Real-Time Pings & Partner Device Token
  // Keyed on the pair ID/status only, so pair-doc updates (lastPingAt, pingCount on every
  // ping) and sound/haptic toggles don't tear down and re-download the listener.
  const activePairId = pair && pair.status === 'active' ? pair.pairId : '';
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const hapticIntensityRef = useRef(themePrefs.incomingHapticIntensity);
  hapticIntensityRef.current = themePrefs.incomingHapticIntensity;
  const fbUid = fbUser?.uid ?? '';

  useEffect(() => {
    if (!authReady || !fbUid || !activePairId) {
      setPings([]);
      return;
    }

    const pingsPath = `pairs/${activePairId}/pings`;
    const pingsQuery = query(
      collection(db, 'pairs', activePairId, 'pings'),
      where('memberUids', 'array-contains', fbUid),
      limit(40)
    );

    const unsubPings = onSnapshot(
      pingsQuery,
      (snap) => {
        const now = Date.now();
        const items = snap.docs.map((d) => {
          const data = d.data() as PingDoc;
          let anchor = pingAnchorMsRef.current.get(data.pingId);
          if (anchor === undefined) {
            const serverMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : now;
            anchor = Math.min(now, serverMs);
            pingAnchorMsRef.current.set(data.pingId, anchor);
          }
          return { ...data, clientCreatedMs: anchor };
        });

        items.sort((a, b) => (b.clientCreatedMs ?? 0) - (a.clientCreatedMs ?? 0));

        if (!initialPingsLoadedRef.current) {
          items.forEach((item) => seenPingIdsRef.current.add(item.pingId));
          initialPingsLoadedRef.current = true;
        } else {
          for (const item of items) {
            if (!seenPingIdsRef.current.has(item.pingId)) {
              seenPingIdsRef.current.add(item.pingId);
              if (item.senderUid !== fbUid) {
                const isUrgent = item.kind === 'urgent_attention';
                setIncomingAlert(item);
                triggerHaptic(
                  isUrgent ? 'receiveUrgent' : 'receive',
                  hapticIntensityRef.current
                );
                if (soundEnabledRef.current) {
                  playWarmChime(isUrgent ? 'receiveUrgent' : 'receive');
                }
                void showPartnerSystemNotification(
                  isUrgent
                    ? `Notifye · Priority from ${item.senderName}`
                    : `Notifye · ${item.senderName}`,
                  item.message ||
                    (isUrgent
                      ? 'Your partner really needs your attention'
                      : 'Your partner wants your attention')
                );
              }
            }
          }
        }

        setPings(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, pingsPath)
    );

    const devicesPath = `pairs/${activePairId}/devices`;
    const devicesQuery = query(
      collection(db, 'pairs', activePairId, 'devices'),
      where('memberUids', 'array-contains', fbUid)
    );

    const unsubDevices = onSnapshot(
      devicesQuery,
      (snap) => {
        const other = snap.docs
          .map((d) => d.data() as PairDeviceDoc)
          .find((d) => d.uid !== fbUid && d.fcmToken);
        setPartnerDeviceToken(other?.fcmToken ?? '');
      },
      (err) => handleFirestoreError(err, OperationType.LIST, devicesPath)
    );

    return () => {
      unsubPings();
      unsubDevices();
    };
  }, [authReady, fbUid, activePairId]);

  // Closed-app notifications, shown by Notifye itself (no other app to install). The native
  // listener (Android: NotifyeListenerService, iPhone: NotifyeLiveListener) keeps a connection to
  // this phone's private relay channel, which is advertised to the partner here.
  const canReceiveInBackground = Capacitor.isNativePlatform();
  const pairMembersKey = pair && pair.status === 'active' ? pair.memberUids.join(',') : '';
  const partnerNameForListener =
    pair && pair.status === 'active'
      ? (pair.partnerAUid === fbUid ? pair.partnerBName : pair.partnerAName) || 'Partner'
      : '';
  useEffect(() => {
    if (!fbUid || !activePairId || !pairMembersKey) return;
    void setDoc(doc(db, 'pairs', activePairId, 'devices', fbUid), {
      uid: fbUid,
      pairId: activePairId,
      memberUids: pairMembersKey.split(','),
      fcmToken: canReceiveInBackground ? toDeviceToken(getReceiveTopic()) : '',
      platform: devicePlatform(),
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);
  }, [fbUid, activePairId, pairMembersKey, canReceiveInBackground]);

  useEffect(() => {
    if (!canReceiveInBackground) return;
    if (activePairId) {
      void ensureNativeNotificationPermission().then(() =>
        startBackgroundListener(getReceiveTopic(), partnerNameForListener)
      );
    } else {
      void stopBackgroundListener();
    }
  }, [canReceiveInBackground, activePairId, partnerNameForListener]);

  // Ask once for notification permission in the native app as soon as a pair is active.
  useEffect(() => {
    if (activePairId) void ensureNativeNotificationPermission();
  }, [activePairId]);

  // 5. Auto-Delete Ping History (5-15s Ephemeral Window)
  // Schedules a single timer for the next expiry instead of polling every 300 ms,
  // which re-rendered the whole app several times a second.
  useEffect(() => {
    const ttlMs = themePrefs.autoDeleteSeconds * 1000;
    const hasItems = pings.length > 0 || testPings.length > 0 || incomingAlert !== null;
    if (!hasItems) return;

    let timer: number | undefined;
    const sweepExpired = () => {
      const now = Date.now();
      let nextExpiry = Infinity;
      const track = (created: number) => {
        const expiry = created + ttlMs;
        if (expiry > now) nextExpiry = Math.min(nextExpiry, expiry);
        return expiry <= now;
      };

      if (incomingAlert) {
        const alertCreated =
          incomingAlert.clientCreatedMs ??
          (incomingAlert.createdAt?.toMillis ? incomingAlert.createdAt.toMillis() : now);
        if (track(alertCreated)) setIncomingAlert(null);
      }

      if (testPings.length > 0) {
        let anyExpired = false;
        for (const p of testPings) {
          if (track(p.clientCreatedMs ?? now)) anyExpired = true;
        }
        if (anyExpired) {
          setTestPings((prev) => prev.filter((p) => now - (p.clientCreatedMs ?? now) < ttlMs));
        }
      }

      if (activePairId && pings.length > 0) {
        for (const p of pings) {
          const expired = track(p.clientCreatedMs ?? now);
          if (expired && !deletingPingIdsRef.current.has(p.pingId)) {
            deletingPingIdsRef.current.add(p.pingId);
            void deleteDoc(doc(db, 'pairs', activePairId, 'pings', p.pingId))
              .catch(() => {
                // Ignore not-found if partner client already deleted it
              })
              .finally(() => {
                pingAnchorMsRef.current.delete(p.pingId);
              });
          }
        }
      }

      if (nextExpiry !== Infinity) {
        timer = window.setTimeout(sweepExpired, Math.max(50, nextExpiry - Date.now() + 20));
      }
    };

    sweepExpired();
    return () => window.clearTimeout(timer);
  }, [themePrefs.autoDeleteSeconds, pings, testPings, incomingAlert, activePairId]);

  // 6. Foreground FCM Listener
  useEffect(() => {
    let cleanup = () => {};
    void subscribeForegroundFcm((payload) => {
      if (soundEnabled) {
        playWarmChime('receive');
      }
      const body = payload.notification?.body || 'Your partner wants your attention';
      void showPartnerSystemNotification(payload.notification?.title || 'Notifye', body);
    }).then((unsub) => {
      cleanup = unsub;
    });
    return () => cleanup();
  }, [soundEnabled]);

  const retryConnect = () => {
    setAuthReady(false);
    setAuthError(null);
    setAuthAttempt((n) => n + 1);
  };

  const handleUpdateDisplayName = async (rawName: string) => {
    if (!fbUser || !profile) return;
    const cleanName = sanitizeDisplayName(rawName);
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        displayName: cleanName,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) => (prev ? { ...prev, displayName: cleanName } : prev));
      try {
        localStorage.setItem(`notifye_name_chosen_${fbUser.uid}`, '1');
      } catch {
        // ignore
      }
      setNameConfirmed(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${fbUser.uid}`);
      throw err;
    }
  };

  const handleCreateCode = async () => {
    if (!fbUser || !profile) return;
    setPairBusy(true);
    setPairError(null);
    try {
      const code = generatePairingCode();
      const pairId = doc(collection(db, 'pairs')).id;
      const batch = writeBatch(db);

      batch.set(doc(db, 'pairs', pairId), {
        pairId,
        partnerAUid: fbUser.uid,
        partnerAName: profile.displayName,
        partnerAPhoto: profile.photoURL,
        partnerBUid: '',
        partnerBName: '',
        partnerBPhoto: '',
        memberUids: [fbUser.uid],
        status: 'waiting',
        lastPingAt: serverTimestamp(),
        lastPingByUid: '',
        lastPingMessage: '',
        pingCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'pairingCodes', code), {
        code,
        creatorUid: fbUser.uid,
        creatorName: profile.displayName,
        creatorPhoto: profile.photoURL,
        pairId,
        status: 'pending',
        claimedByUid: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.update(doc(db, 'users', fbUser.uid), {
        pairId,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      setPendingCode(code);
      try {
        localStorage.setItem('tether_pending_code', code);
      } catch {
        // ignore
      }
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Failed to create pairing code.');
    } finally {
      setPairBusy(false);
    }
  };

  const handleCancelCode = async () => {
    if (!fbUser || !profile?.pairId) return;
    setPairBusy(true);
    setPairError(null);
    try {
      const batch = writeBatch(db);
      if (pendingCode) {
        batch.update(doc(db, 'pairingCodes', pendingCode), {
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        });
      }
      batch.update(doc(db, 'pairs', profile.pairId), {
        status: 'unpaired',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', fbUser.uid), {
        pairId: '',
        partnerUid: '',
        partnerName: '',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setPendingCode('');
      try {
        localStorage.removeItem('tether_pending_code');
      } catch {
        // ignore
      }
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Failed to cancel pairing code.');
    } finally {
      setPairBusy(false);
    }
  };

  const handleJoinWithCode = async (rawCode: string) => {
    if (!fbUser || !profile) return;
    const code = rawCode.trim().toUpperCase();
    setPairBusy(true);
    setPairError(null);
    try {
      const codeRef = doc(db, 'pairingCodes', code);
      const codeSnap = await getDoc(codeRef);
      if (!codeSnap.exists()) {
        throw new Error('Pairing code not found. Double-check the 6 characters with your partner.');
      }
      const codeData = codeSnap.data() as PairingCodeDoc;
      if (codeData.status !== 'pending') {
        throw new Error('This pairing code has already been used or cancelled.');
      }
      if (codeData.creatorUid === fbUser.uid) {
        throw new Error('You cannot enter your own pairing code. Share it with your partner.');
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'pairs', codeData.pairId), {
        partnerBUid: fbUser.uid,
        partnerBName: profile.displayName,
        partnerBPhoto: profile.photoURL,
        memberUids: [codeData.creatorUid, fbUser.uid],
        status: 'active',
        updatedAt: serverTimestamp(),
      });
      batch.update(codeRef, {
        status: 'claimed',
        claimedByUid: fbUser.uid,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', fbUser.uid), {
        pairId: codeData.pairId,
        partnerUid: codeData.creatorUid,
        partnerName: codeData.creatorName,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Could not link with that pairing code.');
    } finally {
      setPairBusy(false);
    }
  };

  const handlePreviewAlert = useCallback(
    (urgent = false) => {
      const now = Date.now();
      const message = urgent
        ? themePrefs.priorityNotifMessage.trim() || 'Your partner really needs your attention'
        : normalPingMessage(themePrefs);
      const isRealActive = Boolean(pair && pair.status === 'active');
      const partnerDisplay = isRealActive
        ? (pair!.partnerAUid === fbUser?.uid ? pair!.partnerBName : pair!.partnerAName) || 'Partner'
        : 'Alex (Test)';
      const previewPing: PingDoc = {
        pingId: generateReverseTimestampId('preview'),
        pairId: pair?.pairId || 'test_pair_preview',
        memberUids: pair?.memberUids || [fbUser?.uid || 'self', 'test_partner'],
        senderUid: 'preview_partner',
        senderName: partnerDisplay,
        message,
        kind: urgent ? 'urgent_attention' : 'attention',
        momentCardUrl: '',
        aspectRatio: '',
        clientCreatedMs: now,
      };
      if (testMode && !isRealActive) {
        setTestPings((prev) => [previewPing, ...prev]);
        setTestPingCount((c) => c + 1);
      }
      setIncomingAlert(previewPing);
      triggerHaptic(
        urgent ? 'receiveUrgent' : 'receive',
        themePrefs.incomingHapticIntensity
      );
      if (soundEnabled) {
        playWarmChime(urgent ? 'receiveUrgent' : 'receive');
      }
      void showPartnerSystemNotification(
        urgent
          ? `Notifye · ${themePrefs.priorityNotifTag.trim() || 'Priority'} from ${partnerDisplay}`
          : `Notifye · ${partnerDisplay}`,
        message
      );
    },
    [
      fbUser?.uid,
      pair,
      soundEnabled,
      testMode,
      themePrefs.incomingHapticIntensity,
      themePrefs.normalNotifMessage,
      themePrefs.buttonLabel,
      themePrefs.priorityNotifMessage,
      themePrefs.priorityNotifTag,
    ]
  );

  const dispatchPing = useCallback(
    async (options: {
      message: string;
      kind: PingDoc['kind'];
      momentCardUrl?: string;
      aspectRatio?: '' | AspectRatioOption;
    }) => {
      const cleanMessage = options.message.trim().slice(0, 280) || 'Your partner wants your attention';

      if (testMode && (!pair || pair.status !== 'active')) {
        if (!fbUser || !profile) return;
        const now = Date.now();
        const pingId = generateReverseTimestampId('test');
        const newPing: PingDoc = {
          pingId,
          pairId: 'test_pair_preview',
          memberUids: [fbUser.uid, 'test_partner'],
          senderUid: fbUser.uid,
          senderName: profile.displayName,
          message: cleanMessage,
          kind: options.kind,
          momentCardUrl: options.momentCardUrl ?? '',
          aspectRatio: options.aspectRatio ?? '',
          clientCreatedMs: now,
        };
        setTestPings((prev) => [newPing, ...prev]);
        setTestPingCount((c) => c + 1);
        if (soundEnabled) {
          playWarmChime(options.kind === 'urgent_attention' ? 'urgentSend' : 'send');
        }
        setLastSentFeedback(
          options.kind === 'urgent_attention'
            ? 'Priority alert sent to Alex (Test)'
            : 'Sent to Alex (Test)'
        );
        setTimeout(() => setLastSentFeedback(null), 2600);
        return;
      }

      if (!fbUser || !profile || !pair || pair.status !== 'active') return;
      // Every tap sends its own ping right away: no waiting for the previous one, no lockout.
      inFlightPingsRef.current += 1;
      setSendingPing(true);
      setPingError(null);
      const partnerLabel =
        pair.partnerAUid === fbUser.uid ? pair.partnerBName : pair.partnerAName;
      if (soundEnabled) {
        playWarmChime(options.kind === 'urgent_attention' ? 'urgentSend' : 'send');
      }
      setLastSentFeedback(
        options.kind === 'urgent_attention'
          ? `Priority alert sent to ${partnerLabel || 'your partner'}`
          : `Sent to ${partnerLabel || 'your partner'}`
      );
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = window.setTimeout(() => setLastSentFeedback(null), 2600);
      // Reaches the partner even when Notifye is closed, if they turned on ntfy notifications.
      sendClosedAppPush(partnerDeviceToken, {
        senderName: profile.displayName,
        message: cleanMessage,
        urgent: options.kind === 'urgent_attention',
      });
      try {
        const pingId = generateReverseTimestampId(fbUser.uid);
        pingAnchorMsRef.current.set(pingId, Date.now());
        seenPingIdsRef.current.add(pingId);
        const batch = writeBatch(db);

        // The pair summary doc is shared, so rapid taps update it at most every 1.5 s
        // (Firestore throttles fast repeated writes to one document). Each ping still
        // gets its own document, which is what the partner's phone listens to.
        const nowMs = Date.now();
        if (nowMs - lastPairUpdateMsRef.current > 1500) {
          lastPairUpdateMsRef.current = nowMs;
          batch.update(doc(db, 'pairs', pair.pairId), {
            lastPingAt: serverTimestamp(),
            lastPingByUid: fbUser.uid,
            lastPingMessage: cleanMessage,
            pingCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        }

        batch.set(doc(db, 'pairs', pair.pairId, 'pings', pingId), {
          pingId,
          pairId: pair.pairId,
          memberUids: pair.memberUids,
          senderUid: fbUser.uid,
          senderName: profile.displayName,
          message: cleanMessage,
          kind: options.kind,
          momentCardUrl: options.momentCardUrl ?? '',
          aspectRatio: options.aspectRatio ?? '',
          createdAt: serverTimestamp(),
        });

        await batch.commit();

      } catch (err) {
        setPingError(err instanceof Error ? err.message : 'Could not send attention ping.');
      } finally {
        inFlightPingsRef.current = Math.max(0, inFlightPingsRef.current - 1);
        if (inFlightPingsRef.current === 0) setSendingPing(false);
      }
    },
    [fbUser, profile, pair, soundEnabled, partnerDeviceToken, testMode]
  );

  // 7. Sync state to iOS WidgetKit extension (Capacitor App Group) & handle widgetAction deep links
  // Debounced so slider drags / typing in Customize don't hit the native bridge per keystroke.
  useEffect(() => {
    if (!authReady || !fbUser || !profile) return;
    const t = window.setTimeout(() => {
      void syncNativeWidgetState({
        refreshToken: fbUser.refreshToken,
        profile,
        pair,
        themePrefs,
        partnerPushTopic: topicFromDeviceToken(partnerDeviceToken) ?? '',
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [authReady, fbUser, profile, pair, themePrefs, partnerDeviceToken]);

  // Widget taps that open the app (notifye://send) queue the same action as ?widgetAction=.
  const [widgetActionTick, setWidgetActionTick] = useState(0);
  useEffect(
    () =>
      subscribeToWidgetLinks((action) => {
        pendingWidgetActionRef.current = action;
        setWidgetActionTick((t) => t + 1);
      }),
    []
  );

  useEffect(() => {
    const action = pendingWidgetActionRef.current;
    if (!action || !authReady || !fbUser || !profile) return;
    const isRealActive = Boolean(pair && pair.status === 'active');
    if (!isRealActive && !testMode) return;

    pendingWidgetActionRef.current = null;
    try {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('widgetAction');
      window.history.replaceState({}, '', nextUrl.pathname + nextUrl.search + nextUrl.hash);
    } catch {
      // ignore history errors
    }

    void dispatchPing({
      message:
        action === 'priority'
          ? themePrefs.priorityNotifMessage.trim() || 'Your partner really needs your attention'
          : normalPingMessage(themePrefs),
      kind: action === 'priority' ? 'urgent_attention' : 'attention',
    });
  }, [
    authReady,
    fbUser,
    profile,
    pair,
    testMode,
    dispatchPing,
    themePrefs.normalNotifMessage,
    themePrefs.buttonLabel,
    themePrefs.priorityNotifMessage,
    widgetActionTick,
  ]);

  const handleToggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (!fbUser) return;
    try {
      await updateDoc(doc(db, 'users', fbUser.uid, 'private', 'account'), {
        soundEnabled: next,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${fbUser.uid}/private/account`);
    }
  };

  const handleUnpair = async () => {
    if (!fbUser || !pair) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'pairs', pair.pairId), {
        status: 'unpaired',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', fbUser.uid), {
        pairId: '',
        partnerUid: '',
        partnerName: '',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `pairs/${pair.pairId}`);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-dvh bg-[#0B0B0F] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
      </div>
    );
  }

  if (!fbUser || (!profile && authError)) {
    return (
      <>
        <div className="min-h-dvh bg-[#0B0B0F] flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-zinc-300 max-w-xs">{authError || 'Could not connect.'}</p>
          <button
            type="button"
            onClick={retryConnect}
            className="min-h-[44px] px-5 rounded-xl bg-amber-500 text-zinc-950 text-sm font-semibold cursor-pointer"
          >
            Try again
          </button>
        </div>
        <OfflineIndicator />
      </>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-dvh bg-[#0B0B0F] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
      </div>
    );
  }

  if (profile.pairId && pairResolvedId !== profile.pairId && !testMode) {
    return (
      <div className="min-h-dvh bg-[#0B0B0F] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
      </div>
    );
  }

  const isActivePair = Boolean(pair && pair.status === 'active');
  const needsNameStep = !nameConfirmed && !isActivePair;

  if (needsNameStep) {
    return (
      <>
        <NameSetupView
          profile={profile}
          onSaveName={handleUpdateDisplayName}
        />
        <OfflineIndicator />
      </>
    );
  }

  const showStudio = isActivePair || testMode;
  const effectivePair: PairDoc =
    isActivePair && pair
      ? pair
      : {
          pairId: 'test_pair_preview',
          partnerAUid: profile.uid,
          partnerAName: profile.displayName,
          partnerAPhoto: profile.photoURL,
          partnerBUid: 'test_partner',
          partnerBName: 'Alex (Test)',
          partnerBPhoto: '',
          memberUids: [profile.uid, 'test_partner'],
          status: 'active',
          lastPingByUid: '',
          lastPingMessage: '',
          pingCount: testPingCount,
        };
  const activePings = isActivePair ? pings : testPings;
  const partnerDisplayName =
    effectivePair.partnerAUid === profile.uid
      ? effectivePair.partnerBName || 'Partner'
      : effectivePair.partnerAName || 'Partner';

  const handleToggleCompactWidget = (enabled: boolean) => {
    setCompactWidgetMode(enabled);
    try {
      const nextUrl = new URL(window.location.href);
      if (enabled) {
        nextUrl.searchParams.set('widget', 'compact');
      } else {
        nextUrl.searchParams.delete('widget');
      }
      window.history.replaceState({}, '', nextUrl.pathname + nextUrl.search + nextUrl.hash);
    } catch {
      // ignore
    }
  };

  return (
    <>
      {showStudio && compactWidgetMode ? (
        <WidgetStandaloneView
          profile={profile}
          pair={effectivePair}
          latestPing={activePings[0] ?? null}
          themePrefs={themePrefs}
          sendingPing={sendingPing}
          lastSentFeedback={lastSentFeedback}
          error={pingError}
          onSendNormal={() =>
            dispatchPing({
              message:
                normalPingMessage(themePrefs),
              kind: 'attention',
            })
          }
          onSendUrgent={() =>
            dispatchPing({
              message:
                themePrefs.priorityNotifMessage.trim() ||
                'Your partner really needs your attention',
              kind: 'urgent_attention',
            })
          }
          onExitStandalone={() => handleToggleCompactWidget(false)}
        />
      ) : showStudio ? (
        <PairedStudio
          profile={profile}
          pair={effectivePair}
          pings={activePings}
          themePrefs={themePrefs}
          onChangeAutoDelete={handleChangeAutoDelete}
          onOpenCustomize={() => setShowCustomizeSheet(true)}
          onOpenNotifications={() => setShowNotificationsSheet(true)}
          // Widgets tab hidden: the Home Screen widget is added from iOS itself (see README).
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          onSendAttentionPing={() =>
            dispatchPing({
              message:
                normalPingMessage(themePrefs),
              kind: 'attention',
            })
          }
          onSendUrgentAttentionPing={() =>
            dispatchPing({
              message:
                themePrefs.priorityNotifMessage.trim() ||
                'Your partner really needs your attention',
              kind: 'urgent_attention',
            })
          }
          onUnpair={handleUnpair}
          incomingAlert={incomingAlert}
          onDismissAlert={() => setIncomingAlert(null)}
          sendingPing={sendingPing}
          lastSentFeedback={lastSentFeedback}
          error={pingError}
          onOpenIpaExport={isNativeApp ? undefined : () => setShowIpaExportSheet(true)}
          isTestMode={!isActivePair && testMode}
          onExitTestMode={exitTestMode}
          onSimulateIncomingPing={handlePreviewAlert}
        />
      ) : (
        <PairingView
          profile={profile}
          waitingPair={pair && pair.status === 'waiting' ? pair : null}
          pendingCode={pendingCode}
          onCreateCode={handleCreateCode}
          onCancelCode={handleCancelCode}
          onJoinWithCode={handleJoinWithCode}
          onUpdateName={handleUpdateDisplayName}
          onBypassPairing={enterTestMode}
          onOpenIpaExport={isNativeApp ? undefined : () => setShowIpaExportSheet(true)}
          busy={pairBusy}
          error={pairError}
        />
      )}


      <Suspense fallback={null}>
        {customizeMounted && (
          <CustomizeSheet
            open={showCustomizeSheet}
            onClose={() => setShowCustomizeSheet(false)}
            prefs={themePrefs}
            onChange={handleUpdateThemePrefs}
          />
        )}

        {notificationsMounted && (
          <NotificationsSheet
            open={showNotificationsSheet}
            onClose={() => setShowNotificationsSheet(false)}
            pings={activePings}
            currentUid={profile.uid}
            accentColor={ambientPalette.effectiveButton}
            backgroundColor={ambientPalette.effectiveBg}
            prefs={themePrefs}
            onUpdatePrefs={handleUpdateThemePrefs}
            onChangeAutoDelete={handleChangeAutoDelete}
            onToggleFloatingAlerts={() =>
              handleUpdateThemePrefs({
                ...themePrefs,
                showFloatingAlerts: !themePrefs.showFloatingAlerts,
              })
            }
            onPreviewAlert={(urgent) => {
              setShowNotificationsSheet(false);
              handlePreviewAlert(urgent);
            }}
          />
        )}

        {widgetsMounted && (
          <WidgetsSheet
            open={showWidgetsSheet}
            onClose={() => setShowWidgetsSheet(false)}
            partnerName={partnerDisplayName}
            latestPing={activePings[0] ?? null}
            prefs={themePrefs}
            onUpdatePrefs={handleUpdateThemePrefs}
            onSendNormal={() =>
              dispatchPing({
                message:
                  normalPingMessage(themePrefs),
                kind: 'attention',
              })
            }
            onSendUrgent={() =>
              dispatchPing({
                message:
                  themePrefs.priorityNotifMessage.trim() ||
                  'Your partner really needs your attention',
                kind: 'urgent_attention',
              })
            }
            onOpenStandaloneWidget={() => handleToggleCompactWidget(true)}
            onOpenIpaExport={isNativeApp ? undefined : () => setShowIpaExportSheet(true)}
            sendingPing={sendingPing}
          />
        )}

        {exportMounted && (
          <MobileExportSheet
            open={showIpaExportSheet}
            onClose={() => setShowIpaExportSheet(false)}
            accentColor={ambientPalette.effectiveButton}
          />
        )}
      </Suspense>

      <OfflineIndicator />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <TetherWorkspace />
    </ErrorBoundary>
  );
}
