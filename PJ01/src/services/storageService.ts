import { FirebaseError } from "firebase/app";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

/** 가상 착용용 모델 사진을 Firebase Storage에 임시 업로드하고 공개 URL 반환 */
export async function uploadModelPhoto(uid: string, uri: string): Promise<string> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const path = `users/${uid}/tryon_model/${Date.now()}.jpg`;
    const imageRef = ref(storage, path);
    await uploadBytes(imageRef, blob);
    return getDownloadURL(imageRef);
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw new Error(`모델 사진 업로드 오류: ${error.code}`);
    }
    throw new Error("모델 사진 업로드 중 오류가 발생했습니다.");
  }
}

export async function uploadAvatarImage(uid: string, uri: string): Promise<string> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const path = `users/${uid}/avatar/avatar.jpg`;
    const imageRef = ref(storage, path);
    await uploadBytes(imageRef, blob);
    return getDownloadURL(imageRef);
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw new Error(`아바타 업로드 오류: ${error.code}`);
    }
    throw new Error("아바타 이미지 업로드 중 오류가 발생했습니다.");
  }
}

export async function uploadWardrobeImage(uid: string, uri: string): Promise<string> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const path = `users/${uid}/wardrobe/${Date.now()}.png`;
    const imageRef = ref(storage, path);
    await uploadBytes(imageRef, blob);
    return getDownloadURL(imageRef);
  } catch (error) {
    if (error instanceof FirebaseError) {
      if (error.code === "storage/unauthorized") {
        throw new Error("Storage 권한이 없습니다. Firebase Storage 규칙을 확인해주세요.");
      }
      if (error.code === "storage/retry-limit-exceeded") {
        throw new Error("업로드 시간이 초과되었습니다. 네트워크를 확인한 뒤 다시 시도해주세요.");
      }
      if (error.code === "storage/unknown") {
        throw new Error(
          "Storage 버킷 설정 또는 Storage 활성화 상태를 확인해주세요. .env의 EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET 값이 Firebase 콘솔의 bucket과 동일해야 합니다.",
        );
      }
      throw new Error(`업로드 오류: ${error.code}`);
    }
    throw new Error("이미지 업로드 중 오류가 발생했습니다.");
  }
}
