import * as ImageManipulator from "expo-image-manipulator";
import { GarmentBoundingBox } from "../types";

/**
 * Crops a garment region from an image using normalized bounding-box
 * coordinates (0–1) returned by GPT-4o vision analysis.
 *
 * @param imageUri  Local file URI of the source image
 * @param box       Normalized bounding box { x, y, width, height } in 0–1
 * @param imageSize Pixel dimensions of the source image
 * @returns         Local URI of the cropped image
 */
export async function cropGarmentRegion(
  imageUri: string,
  box: GarmentBoundingBox,
  imageSize: { width: number; height: number },
): Promise<string> {
  const originX = Math.round(box.x * imageSize.width);
  const originY = Math.round(box.y * imageSize.height);
  const cropWidth = Math.round(box.width * imageSize.width);
  const cropHeight = Math.round(box.height * imageSize.height);

  const safeX = Math.max(0, originX);
  const safeY = Math.max(0, originY);
  const safeW = Math.min(cropWidth, imageSize.width - safeX);
  const safeH = Math.min(cropHeight, imageSize.height - safeY);

  if (safeW <= 0 || safeH <= 0) {
    throw new Error("크롭 영역이 유효하지 않습니다.");
  }

  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ crop: { originX: safeX, originY: safeY, width: safeW, height: safeH } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );

  return result.uri;
}
