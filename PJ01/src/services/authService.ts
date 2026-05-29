import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";

const SESSION_KEY = "fizzylush_session_uid";

function mapAuthError(error: unknown, fallback: string): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "이미 가입된 이메일입니다.";
      case "auth/invalid-email":
        return "이메일 형식이 올바르지 않습니다.";
      case "auth/operation-not-allowed":
        return "Firebase 콘솔에서 이메일/비밀번호 로그인을 활성화해주세요.";
      case "auth/weak-password":
        return "비밀번호는 6자 이상이어야 합니다.";
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "이메일 또는 비밀번호가 올바르지 않습니다.";
      case "auth/network-request-failed":
        return "네트워크 연결을 확인해주세요.";
      default:
        return `인증 오류: ${error.code}`;
    }
  }
  return fallback;
}

export async function loginWithEmail(email: string, password: string): Promise<void> {
  try {
    const result = await signInWithEmailAndPassword(auth, email.trim(), password);
    await AsyncStorage.setItem(SESSION_KEY, result.user.uid);
  } catch (error) {
    throw new Error(mapAuthError(error, "로그인에 실패했습니다."));
  }
}

export async function signUpWithEmail(email: string, password: string): Promise<string> {
  try {
    const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await AsyncStorage.setItem(SESSION_KEY, result.user.uid);
    return result.user.uid;
  } catch (error) {
    throw new Error(mapAuthError(error, "회원가입에 실패했습니다."));
  }
}

export async function logout(): Promise<void> {
  await signOut(auth);
  await AsyncStorage.removeItem(SESSION_KEY);
}
