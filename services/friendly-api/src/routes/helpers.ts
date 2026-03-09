import * as admin from 'firebase-admin';
import { config } from '../config.js';

/**
 * Upload a buffer to Cloud Storage and return a URL.
 * In emulator mode, saves locally and returns a placeholder URL.
 * In production, uploads to GCS and returns a public URL.
 */
export async function uploadBuffer(
  buffer: Buffer,
  path: string,
  contentType: string
): Promise<string> {
  const storageEmulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

  if (storageEmulator) {
    // Emulator mode: upload to emulator bucket, return a local URL
    const bucket = admin.storage().bucket(config.storageBucket);
    const file = bucket.file(path);

    await file.save(buffer, {
      contentType,
      metadata: {
        cacheControl: 'public, max-age=3600',
      },
    });

    // Storage emulator serves files at this URL pattern
    return `http://${storageEmulator}/v0/b/${config.storageBucket}/o/${encodeURIComponent(path)}?alt=media`;
  }

  // Production: upload and make publicly readable
  const bucket = admin.storage().bucket(config.storageBucket);
  const file = bucket.file(path);

  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: 'public, max-age=3600',
    },
  });

  return `https://storage.googleapis.com/${config.storageBucket}/${path}`;
}
