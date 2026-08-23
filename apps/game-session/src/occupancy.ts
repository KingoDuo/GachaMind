import { JOINABLE_ROOMS_SET_KEY, roomHashKey, type RoomProjection } from "@gachamind/shared";
import { PORT } from "./config.js";
import { redis } from "./redis.js";
import type { Room } from "./room.js";

/**
 * 방의 현재 인원을 Redis에 반영한다.
 * matchmaking이 배정 후보를 고를 때 읽는 사본일 뿐이라, 실패해도 게임 진행은 막지 않고 로그만 남긴다.
 * 키가 없으면 port와 capacity까지 같이 써서 스스로 복구한다(배정 기록이 유실돼도 방을 다시 찾을 수 있게).
 */
export async function syncOccupancy(room: Room): Promise<void> {
  const projection: RoomProjection = {
    port: PORT,
    capacity: room.capacity,
    playerCount: room.size,
  };

  try {
    const pipeline = redis.pipeline();
    pipeline.hset(roomHashKey(room.id), projection);
    // 정원이 차면 난입 후보에서 빼고, 자리가 나면 다시 넣는다.
    if (room.isFull) {
      pipeline.srem(JOINABLE_ROOMS_SET_KEY, room.id);
    } else {
      pipeline.sadd(JOINABLE_ROOMS_SET_KEY, room.id);
    }
    await pipeline.exec();
  } catch (err) {
    console.error(`[occupancy] sync failed for ${room.id}:`, err);
  }
}

/** 방이 사라졌음을 Redis에 반영한다. 이걸 빠뜨리면 매칭이 죽은 방으로 사람을 보낸다. */
export async function clearOccupancy(roomId: string): Promise<void> {
  try {
    await redis.pipeline().del(roomHashKey(roomId)).srem(JOINABLE_ROOMS_SET_KEY, roomId).exec();
  } catch (err) {
    console.error(`[occupancy] clear failed for ${roomId}:`, err);
  }
}
