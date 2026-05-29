import { initializeApp, getApps, getApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { getAuth, initializeAuth, type Auth, type Persistence } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const getReactNativePersistence = (
  FirebaseAuth as unknown as {
    getReactNativePersistence: (storage: typeof ReactNativeAsyncStorage) => Persistence;
  }
).getReactNativePersistence;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const authInstance = (() => {
  try {
    if (getReactNativePersistence) {
      return initializeAuth(app, {
        persistence: getReactNativePersistence(ReactNativeAsyncStorage),
      });
    }
    return initializeAuth(app);
  } catch {
    return getAuth(app);
  }
})();

export const auth = authInstance as Auth;

export const db = getFirestore(app);
export const storage = getStorage(app);
