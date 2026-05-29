import { proxyPost } from "./apiProxy";
import { uploadAvatarImage } from "./storageService";
import { getUserProfile, updateAvatarUrl } from "./userProfileService";
import { UserProfile } from "../types";

function buildAvatarPrompt(profile: UserProfile): string {
  const height = profile.height ?? 165;
  const bodyMap = { "슬림": "slim", "보통": "average", "통통": "plus-size" };
  const bodyType = bodyMap[profile.bodyType ?? "보통"] ?? "average";
  const genderMap = { "남성": "male", "여성": "female", "선택 안 함": "" };
  const genderStr = genderMap[profile.gender ?? "선택 안 함"] ?? "";
  const modelDesc = genderStr ? `${genderStr} fashion model` : "fashion model";
  return (
    `Professional ${modelDesc} photo, ${height}cm tall, ${bodyType} body type, ` +
    `standing upright facing forward, full body visible head to toe, ` +
    `arms slightly away from body, wearing simple plain white fitted t-shirt and beige pants, ` +
    `pure white seamless studio background, natural studio lighting, photorealistic, high quality`
  );
}

export async function generateAndSaveAvatar(uid: string, profile: UserProfile): Promise<string> {
  const result = await proxyPost<{ data: Array<{ url: string }> }>(
    "/api/openai/image-generation",
    { prompt: buildAvatarPrompt(profile), size: "1024x1792" },
    60000,
  );

  const tempUrl = result.data?.[0]?.url;
  if (!tempUrl) throw new Error("아바타 이미지 생성에 실패했습니다.");

  const permanentUrl = await uploadAvatarImage(uid, tempUrl);
  await updateAvatarUrl(uid, permanentUrl);
  return permanentUrl;
}

export async function getOrCreateAvatar(uid: string): Promise<string> {
  const profile = await getUserProfile(uid);
  if (!profile) throw new Error("프로필 정보가 없습니다. 온보딩을 완료해주세요.");
  if (profile.avatarUrl) return profile.avatarUrl;
  return generateAndSaveAvatar(uid, profile);
}

export async function regenerateAvatar(uid: string): Promise<string> {
  const profile = await getUserProfile(uid);
  if (!profile) throw new Error("프로필 정보가 없습니다.");
  return generateAndSaveAvatar(uid, profile);
}
