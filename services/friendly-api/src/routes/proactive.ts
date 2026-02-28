import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { runProactiveJob } from '../services/proactive.js';
import type { ProviderRegistry } from '../providers/types.js';

export async function proactiveRoutes(
  app: FastifyInstance,
  providers: ProviderRegistry
): Promise<void> {
  /**
   * Endpoint called by Cloud Scheduler every 15 minutes.
   * Protected by a shared secret (not user auth).
   */
  app.post<{
    Headers: { 'x-job-secret'?: string };
  }>('/api/proactive/run', async (request, reply) => {
    const secret = request.headers['x-job-secret'];
    if (secret !== config.proactiveSecret) {
      return reply.code(403).send({ error: 'Invalid job secret' });
    }

    request.log.info('Starting proactive outreach job');
    const startTime = Date.now();

    try {
      const result = await runProactiveJob(providers);
      const durationMs = Date.now() - startTime;

      request.log.info(
        {
          processed: result.processed,
          sent: result.sent,
          durationMs,
        },
        'Proactive job completed'
      );

      return {
        ok: true,
        processed: result.processed,
        sent: result.sent,
        durationMs,
      };
    } catch (err) {
      request.log.error({ err }, 'Proactive job failed');
      return reply.code(500).send({ error: 'Proactive job failed' });
    }
  });
}
