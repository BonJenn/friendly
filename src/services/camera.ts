import { Camera } from 'expo-camera';
import type { CameraView } from 'expo-camera';

export async function requestCameraPermission(): Promise<boolean> {
  const { granted } = await Camera.requestCameraPermissionsAsync();
  return granted;
}

export async function captureFrame(
  cameraRef: React.RefObject<CameraView | null>
): Promise<string | null> {
  if (!cameraRef.current) return null;

  try {
    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.3,
      base64: true,
      skipProcessing: true,
      shutterSound: false,
    });
    return photo?.base64 ?? null;
  } catch {
    return null;
  }
}

/**
 * Basic change detection by sampling pixels from two base64 images.
 * Compares the raw base64 string length and a hash of sampled characters.
 * Returns true if the scene appears to have changed significantly.
 */
export function detectSignificantChange(
  prevBase64: string | null,
  currentBase64: string
): boolean {
  if (!prevBase64) return true;

  // Quick length-based check: if size differs by >15%, scene likely changed
  const lengthRatio = currentBase64.length / prevBase64.length;
  if (lengthRatio < 0.85 || lengthRatio > 1.15) return true;

  // Sample characters at regular intervals and compare
  const sampleSize = 50;
  const step = Math.floor(currentBase64.length / sampleSize);
  let differences = 0;

  for (let i = 0; i < sampleSize; i++) {
    const idx = i * step;
    if (idx < prevBase64.length && idx < currentBase64.length) {
      if (prevBase64[idx] !== currentBase64[idx]) {
        differences++;
      }
    }
  }

  // If more than 30% of samples differ, scene changed
  return differences / sampleSize > 0.3;
}

/** Interval between frame captures in milliseconds */
export const FRAME_CAPTURE_INTERVAL_MS = 3_000;
