import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_LONG_EDGE = 2048;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err ?? new Error("이미지 크기를 읽지 못했습니다.")),
    );
  });
}

/**
 * JPEG/HEIC/WebP 등 어떤 형식으로 와도 PNG로 통일합니다.
 * 긴 변이 너무 크면 줄여 서버·API 부담을 줄입니다.
 */
export async function normalizeImageToPng(localUri: string): Promise<string> {
  let actions: ImageManipulator.Action[] = [];

  try {
    const { width, height } = await getImageSize(localUri);
    const longEdge = Math.max(width, height);
    if (longEdge > MAX_LONG_EDGE) {
      const scale = MAX_LONG_EDGE / longEdge;
      actions = [{ resize: { width: Math.max(1, Math.round(width * scale)) } }];
    }
  } catch {
    /* 크기를 모르면 리사이즈 없이 포맷만 변환 */
  }

  const result = await ImageManipulator.manipulateAsync(localUri, actions, {
    compress: 1,
    format: ImageManipulator.SaveFormat.PNG,
  });

  return result.uri;
}
