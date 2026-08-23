import {
  JOINABLE_ROOMS_SET_KEY,
  ROOM_HEARTBEAT_INTERVAL_MS,
  ROOM_PROJECTION_TTL_SECONDS,
  roomHashKey,
  type RoomProjection,
} from "@gachamind/shared";
import { PORT } from "./config.js";
import { redis } from "./redis.js";
import type { Room, RoomManager } from "./room.js";

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
    // 갱신할 때마다 TTL을 다시 건다. 프로세스가 죽으면 갱신이 멈추고 방 기록도 만료된다.
    pipeline.expire(roomHashKey(room.id), ROOM_PROJECTION_TTL_SECONDS);
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

/**
 * 이 포트에 배정된 방이 맞는지 확인한다.
 * 이 검증이 없으면 아무 문자열이나 방 코드로 보내서 유령 방을 만들 수 있고,
 * 다른 포트에 배정된 방 코드로 접속하면 같은 방이 두 프로세스에 갈라져 생긴다.
 */
export async function isRoomAssignedHere(roomId: string): Promise<boolean> {
  try {
    const port = await redis.hget(roomHashKey(roomId), "port");
    return port !== null && Number(port) === PORT;
  } catch (err) {
    // Redis가 흔들릴 때 입장을 막으면 게임 전체가 멈춘다. 유령 방 방지는 부차적이므로 통과시킨다.
    console.error(`[occupancy] assignment check failed for ${roomId}, allowing join:`, err);
    return true;
  }
}

/**
 * 살아있는 방들의 TTL을 주기적으로 갱신한다.
 * 조용한 방(입퇴장이 없는 방)도 만료되지 않게 하는 것이 목적이다.
 */
export function startOccupancyHeartbeat(roomManager: RoomManager): NodeJS.Timeout {
  const timer = setInterval(() => {
    for (const room of roomManager.allRooms) void syncOccupancy(room);
  }, ROOM_HEARTBEAT_INTERVAL_MS);
  // 하트비트 때문에 프로세스가 종료되지 못하는 일이 없도록 한다.
  timer.unref();
  return timer;
}
