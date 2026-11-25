import { useCallback, useEffect, useRef, useState } from 'react';
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  showPartnerSystemNotification,
  subscribeForegroundFcm,
} from './firebase';
import { hasNativeGoogleSignIn, nativeGoogleSignIn, nativeSignOut } from './utils/nativeAuth';
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
import { AuthView } from './components/AuthView';
import { CustomizeSheet } from './components/CustomizeSheet';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MobileExportSheet } from './components/MobileExportSheet';
import { NameSetupView } from './components/NameSetupView';
import { NotificationsSheet } from './components/NotificationsSheet';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PairedStudio } from './components/PairedStudio';
import { PairingView } from './components/PairingView';
import { WidgetsSheet } from './components/WidgetsSheet';
import { WidgetStandaloneView } from './components/WidgetStandaloneView';
import { playWarmChime } from './utils/chime';
import { triggerHaptic } from './utils/haptics';
import { loadThemePrefs, resolveAmbientPalette, saveThemePrefs } from './utils/themeColors';
import { clearNativeWidgetState, syncNativeWidgetState } from './utils/widgetBridge';

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

  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [sendingPing, setSendingPing] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const [lastSentFeedback, setLastSentFeedback] = useState<string | null>(null);
  const [incomingAlert, setIncomingAlert] = useState<PingDoc | null>(null);

  const [nameConfirmed, setNameConfirmed] = useState(true);
  const [justSignedIn, setJustSignedIn] = useState(false);

  const [showCustomizeSheet, setShowCustomizeSheet] = useState(false);
  const [showNotificationsSheet, setShowNotificationsSheet] = useState(false);
  const [showWidgetsSheet, setShowWidgetsSheet] = useState(false);
  const [showIpaExportSheet, setShowIpaExportSheet] = useState(false);
  const [compactWidgetMode, setCompactWidgetMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('widget') === 'compact';
  });
  const [themePrefs, setThemePrefs] = useState<StudioThemePrefs>(() => loadThemePrefs());

  const initialPingsLoadedRef = useRef(false);
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
      setFbUser(user);
      setAuthReady(true);

      if (!user) {
        setProfile(null);
        setPair(null);
        setPings([]);
        setNameConfirmed(true);
        setJustSignedIn(false);
        initialPingsLoadedRef.current = false;
        seenPingIdsRef.current.clear();
        return;
      }

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
        handleFirestoreError(err, OperationType.WRITE, userPath);
      }
    });
    // Safety net: never sit on the loading spinner forever if auth fails to initialize.
    const authTimeout = window.setTimeout(() => setAuthReady(true), 8000);
    return () => {
      window.clearTimeout(authTimeout);
      unsub();
    };
  }, []);

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
    const pairsQuery = query(
      collection(db, 'pairs'),
      where('memberUids', 'array-contains', fbUser.uid)
    );
    const unsubPair = onSnapshot(
      pairsQuery,
      (snap) => {
        const match = snap.docs.find((d) => d.id === targetPairId);
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

    return () => unsubPair();
  }, [authReady, fbUser, profile?.pairId]);

  // 4. Listen to Real-Time Pings & Partner Device Token
  useEffect(() => {
    if (!authReady || !fbUser || !pair || pair.status !== 'active') {
      setPings([]);
      return;
    }

    const pingsPath = `pairs/${pair.pairId}/pings`;
    const pingsQuery = query(
      collection(db, 'pairs', pair.pairId, 'pings'),
      where('memberUids', 'array-contains', fbUser.uid),
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
              if (item.senderUid !== fbUser.uid) {
                const isUrgent = item.kind === 'urgent_attention';
                setIncomingAlert(item);
                triggerHaptic(
                  isUrgent ? 'receiveUrgent' : 'receive',
                  themePrefs.incomingHapticIntensity
                );
                if (soundEnabled) {
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

    const devicesPath = `pairs/${pair.pairId}/devices`;
    const devicesQuery = query(
      collection(db, 'pairs', pair.pairId, 'devices'),
      where('memberUids', 'array-contains', fbUser.uid)
    );

    const unsubDevices = onSnapshot(
      devicesQuery,
      (snap) => {
        const other = snap.docs
          .map((d) => d.data() as PairDeviceDoc)
          .find((d) => d.uid !== fbUser.uid && d.fcmToken);
        setPartnerDeviceToken(other?.fcmToken ?? '');
      },
      (err) => handleFirestoreError(err, OperationType.LIST, devicesPath)
    );

    return () => {
      unsubPings();
      unsubDevices();
    };
  }, [authReady, fbUser, pair, soundEnabled, themePrefs.incomingHapticIntensity]);

  // 5. Auto-Delete Ping History (5-15s Ephemeral Window)
  useEffect(() => {
    const ttlMs = themePrefs.autoDeleteSeconds * 1000;
    const hasItems = pings.length > 0 || testPings.length > 0 || incomingAlert !== null;
    if (!hasItems) return;

    const sweepExpired = () => {
      const now = Date.now();

      if (incomingAlert) {
        const alertCreated =
          incomingAlert.clientCreatedMs ??
          (incomingAlert.createdAt?.toMillis ? incomingAlert.createdAt.toMillis() : now);
        if (now - alertCreated >= ttlMs) {
          setIncomingAlert(null);
        }
      }

      if (testPings.length > 0) {
        setTestPings((prev) =>
          prev.filter((p) => now - (p.clientCreatedMs ?? now) < ttlMs)
        );
      }

      if (pair && pair.status === 'active' && pings.length > 0) {
        for (const p of pings) {
          const created = p.clientCreatedMs ?? now;
          if (now - created >= ttlMs && !deletingPingIdsRef.current.has(p.pingId)) {
            deletingPingIdsRef.current.add(p.pingId);
            void deleteDoc(doc(db, 'pairs', pair.pairId, 'pings', p.pingId))
              .catch(() => {
                // Ignore not-found if partner client already deleted it
              })
              .finally(() => {
                pingAnchorMsRef.current.delete(p.pingId);
              });
          }
        }
      }
    };

    sweepExpired();
    const timer = window.setInterval(sweepExpired, 300);
    return () => window.clearInterval(timer);
  }, [themePrefs.autoDeleteSeconds, pings, testPings.length, incomingAlert, pair]);

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

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      let cred;
      if (hasNativeGoogleSignIn()) {
        const { idToken, accessToken } = await nativeGoogleSignIn();
        cred = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken, accessToken));
      } else {
        // On iOS, auth is initialized without a popup resolver (it hangs app startup),
        // so pass it here; it only loads when the user taps sign-in.
        cred = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
      }
      try {
        localStorage.removeItem(`notifye_name_chosen_${cred.user.uid}`);
      } catch {
        // ignore
      }
      setNameConfirmed(false);
      setJustSignedIn(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setJustSignedIn(false);
    exitTestMode();
    void clearNativeWidgetState();
    await nativeSignOut();
    await signOut(auth);
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
      setJustSignedIn(false);
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
        : themePrefs.normalNotifMessage.trim() || 'Your partner wants your attention';
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
      setSendingPing(true);
      setPingError(null);
      try {
        const pingId = generateReverseTimestampId(fbUser.uid);
        pingAnchorMsRef.current.set(pingId, Date.now());
        const batch = writeBatch(db);

        batch.update(doc(db, 'pairs', pair.pairId), {
          lastPingAt: serverTimestamp(),
          lastPingByUid: fbUser.uid,
          lastPingMessage: cleanMessage,
          pingCount: (pair.pingCount || 0) + 1,
          updatedAt: serverTimestamp(),
        });

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
        seenPingIdsRef.current.add(pingId);

        if (soundEnabled) {
          playWarmChime(options.kind === 'urgent_attention' ? 'urgentSend' : 'send');
        }

        const partnerLabel =
          pair.partnerAUid === fbUser.uid ? pair.partnerBName : pair.partnerAName;
        setLastSentFeedback(
          options.kind === 'urgent_attention'
            ? `Priority alert sent to ${partnerLabel || 'your partner'}`
            : `Sent to ${partnerLabel || 'your partner'}`
        );
        setTimeout(() => setLastSentFeedback(null), 2600);

        if (partnerDeviceToken) {
          void fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetToken: partnerDeviceToken,
              senderName: profile.displayName,
              message: cleanMessage,
              pairId: pair.pairId,
            }),
          }).catch(() => undefined);
        }
      } catch (err) {
        setPingError(err instanceof Error ? err.message : 'Could not send attention ping.');
      } finally {
        setSendingPing(false);
      }
    },
    [fbUser, profile, pair, soundEnabled, partnerDeviceToken, testMode]
  );

  // 7. Sync state to iOS WidgetKit extension (Capacitor App Group) & handle widgetAction deep links
  useEffect(() => {
    if (!authReady || !fbUser || !profile) return;
    void syncNativeWidgetState({
      refreshToken: fbUser.refreshToken,
      profile,
      pair,
      themePrefs,
    });
  }, [authReady, fbUser, profile, pair, themePrefs]);

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
          : themePrefs.normalNotifMessage.trim() || 'Your partner wants your attention',
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
    themePrefs.priorityNotifMessage,
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
      <div className="min-h-screen bg-[#0B0B0F] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
      </div>
    );
  }

  if (!fbUser) {
    return (
      <>
        <AuthView onSignIn={handleSignIn} error={authError} busy={authBusy} />
        <OfflineIndicator />
      </>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
      </div>
    );
  }

  const isActivePair = Boolean(pair && pair.status === 'active');
  const needsNameStep = justSignedIn || (!nameConfirmed && !isActivePair);

  if (needsNameStep) {
    return (
      <>
        <NameSetupView
          profile={profile}
          email={fbUser.email}
          onSaveName={handleUpdateDisplayName}
          onSignOut={handleSignOut}
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
                themePrefs.normalNotifMessage.trim() || 'Your partner wants your attention',
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
          onOpenWidgets={() => setShowWidgetsSheet(true)}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          onSendAttentionPing={() =>
            dispatchPing({
              message:
                themePrefs.normalNotifMessage.trim() || 'Your partner wants your attention',
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
          onSignOut={handleSignOut}
          incomingAlert={incomingAlert}
          onDismissAlert={() => setIncomingAlert(null)}
          sendingPing={sendingPing}
          lastSentFeedback={lastSentFeedback}
          error={pingError}
          onOpenIpaExport={() => setShowIpaExportSheet(true)}
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
          onOpenIpaExport={() => setShowIpaExportSheet(true)}
          onSignOut={handleSignOut}
          busy={pairBusy}
          error={pairError}
        />
      )}

      <CustomizeSheet
        open={showCustomizeSheet}
        onClose={() => setShowCustomizeSheet(false)}
        prefs={themePrefs}
        onChange={handleUpdateThemePrefs}
      />

      <NotificationsSheet
        open={showNotificationsSheet}
        onClose={() => setShowNotificationsSheet(false)}
        pings={activePings}
        currentUid={profile.uid}
        accentColor={resolveAmbientPalette(themePrefs).effectiveButton}
        backgroundColor={resolveAmbientPalette(themePrefs).effectiveBg}
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
              themePrefs.normalNotifMessage.trim() || 'Your partner wants your attention',
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
        onOpenIpaExport={() => setShowIpaExportSheet(true)}
        sendingPing={sendingPing}
      />

      <MobileExportSheet
        open={showIpaExportSheet}
        onClose={() => setShowIpaExportSheet(false)}
        accentColor={resolveAmbientPalette(themePrefs).effectiveButton}
      />

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
