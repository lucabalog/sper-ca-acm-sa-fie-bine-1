import { Capacitor, registerPlugin } from '@capacitor/core';

// Minimal typing for the native @capacitor-firebase/authentication plugin.
// The native plugin is only compiled into the iOS build when a
// GoogleService-Info.plist is provided to CI, so always check
// hasNativeGoogleSignIn() before calling it.
interface NativeAuthCredential {
  idToken?: string;
  accessToken?: string;
}

interface FirebaseAuthenticationPlugin {
  signInWithGoogle(options?: { skipNativeAuth?: boolean }): Promise<{
    credential: NativeAuthCredential | null;
  }>;
  signOut(): Promise<void>;
}

const FirebaseAuthentication = registerPlugin<FirebaseAuthenticationPlugin>('FirebaseAuthentication');

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

export const hasNativeGoogleSignIn = (): boolean =>
  isNativeApp() && Capacitor.isPluginAvailable('FirebaseAuthentication');

/**
 * Runs the native Google Sign-In sheet and returns the Google ID/access tokens.
 * Native Firebase auth is skipped; the caller signs in the Firebase JS SDK with these tokens.
 */
export async function nativeGoogleSignIn(): Promise<NativeAuthCredential> {
  const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
  if (!result.credential?.idToken) {
    throw new Error('Google Sign-In did not return an ID token.');
  }
  return result.credential;
}

export async function nativeSignOut(): Promise<void> {
  if (!hasNativeGoogleSignIn()) return;
  try {
    await FirebaseAuthentication.signOut();
  } catch {
    // Native session may already be cleared.
  }
}
