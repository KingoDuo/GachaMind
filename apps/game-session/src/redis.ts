import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = new Redis(REDIS_URL);

redis.on("error", (err: Error) => console.error("[game-session] redis error:", err));
