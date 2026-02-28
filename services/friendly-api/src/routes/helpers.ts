import * as admin from 'firebase-admin';
import { config } from '../config.js';

/**
 * Upload a buffer to Cloud Storage and return a signed URL.
 */
export async function uploadBuffer(
  buffer: Buffer,
  path: string,
  contentType: string
): Promise<string> {
  const bucket = admin.storage().bucket(config.storageBucket);
  const file = bucket.file(path);

  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: 'public, max-age=3600',
    },
  });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + config.audioSignedUrlExpiryMinutes * 60 * 1000,
  });

  return signedUrl;
}
