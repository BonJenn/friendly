import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config.js';

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    keyGenerator: (request) => {
      // Rate limit by authenticated user if available, else by IP
      return (request as any).authUser?.uid ?? request.ip;
    },
    errorResponseBuilder: () => ({
      error: 'Too many requests. Slow down a bit!',
      statusCode: 429,
    }),
  });
}
