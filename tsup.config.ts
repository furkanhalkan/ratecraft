import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/express": "src/adapters/express.ts",
    "adapters/fastify": "src/adapters/fastify.ts",
    "adapters/hono": "src/adapters/hono.ts",
    "stores/redis": "src/stores/redis.ts",
    "stores/memcached": "src/stores/memcached.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ["ioredis", "memcached", "express", "fastify", "fastify-plugin", "hono"],
});
