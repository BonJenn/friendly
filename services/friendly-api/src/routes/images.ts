import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { checkImageCap, incrementUsage } from '../services/metering.js';
import { uploadBuffer } from './helpers.js';
import type { ProviderRegistry } from '../providers/types.js';
import * as admin from 'firebase-admin';
import type { UserProfile } from '../types/index.js';

const db = admin.firestore();

export async function imageRoutes(
  app: FastifyInstance,
  providers: ProviderRegistry
): Promise<void> {
  app.post<{
    Body: { prompt: string };
  }>(
    '/api/images/generate',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.authUser;
      const { prompt } = request.body;

      if (!prompt?.trim()) {
        return reply.code(400).send({ error: 'prompt required' });
      }

      // Get user tier
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return reply.code(404).send({ error: 'User not found' });
      }
      const user = userDoc.data() as UserProfile;

      // Check image cap
      const capCheck = await checkImageCap(uid, user.tier);
      if (!capCheck.allowed) {
        return reply.code(429).send({
          error: 'Image limit reached for this week',
        });
      }

      // Generate image
      const result = await providers.image.generate(prompt, 'cartoon');

      // Upload to storage
      const imageUrl = await uploadBuffer(
        result.imageBuffer,
        `images/${uid}/${Date.now()}.png`,
        result.mimeType
      );

      // Track usage
      await incrementUsage(uid, 'imagesUsed');

      return { imageUrl };
    }
  );
}
