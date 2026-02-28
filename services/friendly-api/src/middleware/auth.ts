import type { FastifyRequest, FastifyReply } from 'fastify';
import * as admin from 'firebase-admin';
import type { AuthenticatedUser } from '../types/index.js';

// Extend Fastify request with authenticated user
declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthenticatedUser;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // DEV-ONLY bypass: Bearer dev:<uid> skips Firebase token verification
  // This is stripped in production by the NODE_ENV check
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  if (token.startsWith('dev:') && process.env.NODE_ENV !== 'production') {
    const uid = token.slice(4);
    request.authUser = { uid, email: `${uid}@dev.local` };
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    request.authUser = {
      uid: decoded.uid,
      email: decoded.email ?? '',
    };
  } catch (err) {
    request.log.warn({ err }, 'Token verification failed');
    reply.code(401).send({ error: 'Invalid or expired token' });
  }
}
