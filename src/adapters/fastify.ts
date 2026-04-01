import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import type { RateCraft } from "../core/rate-limiter";
import { buildRateLimitHeaders } from "../utils/headers";

interface RateCraftPluginOptions {
  limiter: RateCraft;
}

/**
 * Fastify plugin adapter for RateCraft.
 *
 * @param limiter - RateCraft instance
 * @returns Fastify plugin (wrapped with fastify-plugin)
 */
export function fastifyAdapter(limiter: RateCraft) {
  const plugin: FastifyPluginCallback<RateCraftPluginOptions> = (fastify, _opts, done) => {
    const options = limiter.getOptions();

    fastify.addHook("onRequest", async (request, reply) => {
      // Skip check
      if (await options.skip(request)) {
        return;
      }

      const key = options.keyGenerator(request);
      const result = await limiter.consume(key);

      // Set rate limit headers
      if (options.headers) {
        const headers = buildRateLimitHeaders(result, options.legacyHeaders);
        for (const [name, value] of Object.entries(headers)) {
          reply.header(name, value);
        }
      }

      if (!result.allowed) {
        options.onRateLimited(request, result);
        reply.code(options.statusCode).send(options.message);
      }
    });

    done();
  };

  return fp(plugin, { name: "ratecraft" });
}
