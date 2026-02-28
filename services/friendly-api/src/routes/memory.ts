import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { getMemory } from '../services/memory.js';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/memory', { preHandler: authMiddleware }, async (request) => {
    const { uid } = request.authUser;
    const memory = await getMemory(uid);

    if (!memory) {
      return {
        summary: '',
        facts: [],
        insideJokes: [],
      };
    }

    return {
      summary: memory.summary,
      facts: memory.facts,
      insideJokes: memory.insideJokes,
    };
  });
}
