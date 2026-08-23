import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import {
  DEFAULT_ROOM_CAPACITY,
  JOINABLE_ROOMS_SET_KEY,
  ROOM_PROJECTION_TTL_SECONDS,
  roomHashKey,
  type AssignMode,
  type RoomAssignment,
} from "@gachamind/shared";
import { redis } from "./redis.js";

const PORT = Number(process.env.PORT ?? 4000);

// TODO: 콤마로 여러 포트를 받아 least-loaded 포트를 고른다. 지금은 첫 번째 포트만 사용.
const [GAME_SESSION_PORT] = (process.env.GAME_SESSION_PORTS ?? "4001")
  .split(",")
  .map((s) => Number(s.trim()));

const app = Fastify({ logger: false });

app.get("/health", async () => ({ status: "ok", service: "matchmaking" }));

// 방 배정. TODO: mode=match면 rooms:joinable에서 난입 대상을 고른다. 지금은 항상 새 방을 만든다.
// 여기서 만드는 건 예약일 뿐이라 rooms:joinable에는 넣지 않는다.
// 실제로 첫 플레이어가 접속해 game-session에 방이 생겨야 난입 후보가 된다.
app.post<{ Body: { mode?: AssignMode } }>("/assign", async (_req, reply) => {
  const roomId = randomUUID();
  await redis
    .pipeline()
    .hset(roomHashKey(roomId), {
      port: GAME_SESSION_PORT,
      capacity: DEFAULT_ROOM_CAPACITY,
      playerCount: 0,
    })
    // 아무도 접속하지 않은 예약은 스스로 사라진다. 접속이 생기면 game-session이 TTL을 계속 갱신한다.
    .expire(roomHashKey(roomId), ROOM_PROJECTION_TTL_SECONDS)
    .exec();
  return reply.send({ roomId, port: GAME_SESSION_PORT } satisfies RoomAssignment);
});

// 방 코드 → 포트 조회.
app.get<{ Params: { roomId: string } }>("/rooms/:roomId", async (req, reply) => {
  const hash = await redis.hgetall(roomHashKey(req.params.roomId));
  if (!hash.port) {
    return reply.code(404).send({ error: "room not found" });
  }
  return reply.send({ roomId: req.params.roomId, port: Number(hash.port) } satisfies RoomAssignment);
});

// game-session이 빈 방을 정리했을 때 호출하는 콜백.
// 매칭 인덱스의 주인은 matchmaking이므로 키 삭제도 여기서만 한다.
app.delete<{ Params: { roomId: string } }>("/rooms/:roomId", async (req, reply) => {
  const { roomId } = req.params;
  await redis.pipeline().del(roomHashKey(roomId)).srem(JOINABLE_ROOMS_SET_KEY, roomId).exec();
  console.log(`[matchmaking] closed room ${roomId}`);
  return reply.code(204).send();
});

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`[matchmaking] listening on ${PORT}`);
