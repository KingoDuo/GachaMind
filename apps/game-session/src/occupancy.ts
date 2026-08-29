import {
  JOINABLE_ROOMS_SET_KEY,
  PROJECTION_HEARTBEAT_INTERVAL_MS,
  PROJECTION_TTL_SECONDS,
  roomHashKey,
  sessionLoadKey,
  type RoomProjection,
  type SessionLoad,
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
    phase: room.phase,
  };

  try {
    const pipeline = redis.pipeline();
    pipeline.hset(roomHashKey(room.id), projection);
    // 갱신할 때마다 TTL을 다시 건다. 프로세스가 죽으면 갱신이 멈추고 방 기록도 만료된다.
    pipeline.expire(roomHashKey(room.id), PROJECTION_TTL_SECONDS);
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
 * 이 replica의 부하를 알린다. matchmaking이 새 방을 어디에 둘지 고르는 근거다.
 * 방이 하나도 없어도 반드시 보고해야 한다. 보고하지 않으면 죽은 replica로 간주돼 아무 방도 배정받지 못한다.
 */
export async function publishSessionLoad(roomManager: RoomManager): Promise<void> {
  const load: SessionLoad = {
    port: PORT,
    rooms: roomManager.roomCount,
    connections: roomManager.totalConnections,
  };

  try {
    await redis
      .pipeline()
      .hset(sessionLoadKey(PORT), load)
      .expire(sessionLoadKey(PORT), PROJECTION_TTL_SECONDS)
      .exec();
  } catch (err) {
    console.error(`[occupancy] session load publish failed:`, err);
  }
}

/** 정상 종료 시 부하 보고를 지운다. TTL을 기다리지 않고 즉시 배정 대상에서 빠진다. */
export async function clearSessionLoad(): Promise<void> {
  try {
    await redis.del(sessionLoadKey(PORT));
  } catch (err) {
    console.error(`[occupancy] session load clear failed:`, err);
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
 * 살아있는 방과 이 replica의 부하 보고를 주기적으로 갱신한다.
 * 조용한 방(입퇴장이 없는 방)도 만료되지 않게 하는 것이 목적이다.
 */
export function startProjectionHeartbeat(roomManager: RoomManager): NodeJS.Timeout {
  const timer = setInterval(() => {
    for (const room of roomManager.allRooms) void syncOccupancy(room);
    void publishSessionLoad(roomManager);
  }, PROJECTION_HEARTBEAT_INTERVAL_MS);
  // 하트비트 때문에 프로세스가 종료되지 못하는 일이 없도록 한다.
  timer.unref();
  return timer;
}
