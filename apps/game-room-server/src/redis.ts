import { createClient } from "redis";
import { JOINABLE_ROOMS_SET_KEY, roomHashKey } from "@gachamind/shared";

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

/** 방이 처음 생성됐을 때 Redis에 등록하고 joinable set에 추가한다. */
export async function registerRoomInRedis(
  roomId: string,
  port: number,
  capacity: number,
): Promise<void> {
  await redis.hSet(roomHashKey(roomId), {
    port: String(port),
    capacity: String(capacity),
    playerCount: "0",
  });
  await redis.sAdd(JOINABLE_ROOMS_SET_KEY, roomId);
}

/** 인원 변동이 생길 때마다 playerCount를 갱신하고, 정원 기준으로 joinable set 소속을 조정한다. */
export async function syncRoomOccupancy(
  roomId: string,
  playerCount: number,
  capacity: number,
): Promise<void> {
  await redis.hSet(roomHashKey(roomId), { playerCount: String(playerCount) });
  if (playerCount < capacity) {
    await redis.sAdd(JOINABLE_ROOMS_SET_KEY, roomId);
  } else {
    await redis.sRem(JOINABLE_ROOMS_SET_KEY, roomId);
  }
}

/** 방이 비어서 정리됐을 때 Redis에서도 지운다. */
export async function unregisterRoomFromRedis(roomId: string): Promise<void> {
  await redis.del(roomHashKey(roomId));
  await redis.sRem(JOINABLE_ROOMS_SET_KEY, roomId);
}
