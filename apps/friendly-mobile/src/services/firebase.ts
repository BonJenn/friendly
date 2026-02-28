import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import messaging from '@react-native-firebase/messaging';

// Firebase is auto-initialized from GoogleService-Info.plist (iOS)
// and google-services.json (Android) via the native modules.

export const fbAuth = auth();
export const db = firestore();
export const fbStorage = storage();
export const fbMessaging = messaging();

export { firebase, auth, firestore, storage, messaging };
