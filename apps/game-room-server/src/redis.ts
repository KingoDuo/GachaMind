import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = createClient({ url: REDIS_URL });

redis.on("error", (err) => {
  console.error("[redis] client error:", err);
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
    console.log(`[redis] connected to ${REDIS_URL}`);
  }
}
