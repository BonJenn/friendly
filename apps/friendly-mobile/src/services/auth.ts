import { fbAuth } from './firebase';
import auth from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

export async function signInWithApple(): Promise<void> {
  const nonce = Math.random().toString(36).substring(2, 10);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  const oAuthCredential = auth.AppleAuthProvider.credential(
    credential.identityToken!,
    nonce
  );

  await fbAuth.signInWithCredential(oAuthCredential);
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<void> {
  await fbAuth.signInWithEmailAndPassword(email, password);
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<void> {
  await fbAuth.createUserWithEmailAndPassword(email, password);
}

export async function signOut(): Promise<void> {
  await fbAuth.signOut();
}

export function getCurrentUser() {
  return fbAuth.currentUser;
}

export async function getIdToken(): Promise<string> {
  const user = fbAuth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}
