import { createClient, type RedisClientType } from "redis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Next.js dev 모드는 파일이 바뀔 때마다 모듈을 다시 평가하므로, globalThis에 캐싱해두지
// 않으면 HMR이 일어날 때마다 새 Redis 커넥션이 쌓인다.
const globalForRedis = globalThis as unknown as { redisClient?: RedisClientType };

function createRedisClient(): RedisClientType {
  const client: RedisClientType = createClient({ url: REDIS_URL });
  client.on("error", (err) => console.error("[redis] client error:", err));
  return client;
}

export const redis: RedisClientType = globalForRedis.redisClient ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisClient = redis;
}

export async function getRedis(): Promise<RedisClientType> {
  if (!redis.isOpen) {
    await redis.connect();
  }
  return redis;
}
