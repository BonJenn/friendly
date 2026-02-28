import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { getDailyUsage } from '../services/metering.js';

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/usage', { preHandler: authMiddleware }, async (request) => {
    const { uid } = request.authUser;
    const usage = await getDailyUsage(uid);
    return usage;
  });
}
