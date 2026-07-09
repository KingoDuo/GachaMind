import { JOINABLE_ROOMS_SET_KEY, roomHashKey, type RoomAssignment } from "@gachamind/shared";
import { getRedis } from "./redis";

/** 정원이 남은 방을 무작위로 하나 고른다. 없으면 undefined. */
export async function pickJoinableRoom(): Promise<RoomAssignment | undefined> {
  const redis = await getRedis();
  const roomId = await redis.sRandMember(JOINABLE_ROOMS_SET_KEY);
  if (!roomId) return undefined;

  const port = await redis.hGet(roomHashKey(roomId), "port");
  if (!port) {
    // game-room-server가 정리했지만 set에는 아직 남아있던 오래된 엔트리.
    await redis.sRem(JOINABLE_ROOMS_SET_KEY, roomId);
    return undefined;
  }

  return { roomId, port: Number(port) };
}
