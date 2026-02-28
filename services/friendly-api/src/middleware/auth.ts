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
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
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
