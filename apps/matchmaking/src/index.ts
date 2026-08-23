import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import {
  DEFAULT_ROOM_CAPACITY,
  JOINABLE_ROOMS_SET_KEY,
  PROJECTION_TTL_SECONDS,
  roomHashKey,
  sessionLoadKey,
  type AssignMode,
  type RoomAssignment,
} from "@gachamind/shared";
import { redis } from "./redis.js";

const PORT = Number(process.env.PORT ?? 4000);

/** 배정 대상 replica 포트 목록. 실제 후보는 이 중 부하를 보고하고 있는 포트뿐이다. */
const GAME_SESSION_PORTS = (process.env.GAME_SESSION_PORTS ?? "4001")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((port) => Number.isFinite(port));

/** 난입 후보를 한 번에 뽑아보는 개수. 죽은 방을 만나도 왕복 없이 다음 후보로 넘어가려고 여러 개 뽑는다. */
const JOINABLE_SAMPLE_SIZE = 10;

const app = Fastify({ logger: false });

app.get("/health", async () => ({ status: "ok", service: "matchmaking" }));

/**
 * 살아있는 replica 중 접속 수가 가장 적은 포트를 고른다.
 * 부하를 보고하지 않는 포트는 죽은 것으로 보고 후보에서 뺀다.
 */
async function pickLeastLoadedPort(): Promise<number | null> {
  const pipeline = redis.pipeline();
  for (const port of GAME_SESSION_PORTS) pipeline.hget(sessionLoadKey(port), "connections");
  const results = await pipeline.exec();

  let bestPort: number | null = null;
  let bestConnections = Number.POSITIVE_INFINITY;

  for (let i = 0; i < GAME_SESSION_PORTS.length; i += 1) {
    const reported = results?.[i]?.[1] as string | null | undefined;
    if (reported === null || reported === undefined) continue;

    const connections = Number(reported);
    if (connections < bestConnections) {
      bestConnections = connections;
      bestPort = GAME_SESSION_PORTS[i];
    }
  }

  return bestPort;
}

/**
 * 진행 중인 방 하나를 난입 대상으로 고른다.
 * rooms:joinable은 Set이라 멤버 단위 TTL이 없어서, 크래시로 사라진 방의 흔적이 남는다.
 * 그래서 후보를 확인하면서 죽은 방을 그때그때 인덱스에서 지운다(읽는 쪽 지연 정리).
 */
async function pickJoinableRoom(): Promise<RoomAssignment | null> {
  const candidates = await redis.srandmember(JOINABLE_ROOMS_SET_KEY, JOINABLE_SAMPLE_SIZE);
  if (candidates.length === 0) return null;

  const pipeline = redis.pipeline();
  for (const roomId of candidates) pipeline.hgetall(roomHashKey(roomId));
  const results = await pipeline.exec();

  const alive: RoomAssignment[] = [];
  const stale: string[] = [];

  // 첫 후보에서 멈추지 않고 전부 확인한다. 그래야 죽은 멤버를 한 번에 지울 수 있다.
  for (let i = 0; i < candidates.length; i += 1) {
    const roomId = candidates[i];
    const hash = results?.[i]?.[1] as Record<string, string> | undefined;

    // 방 기록이 만료됐는데 Set 멤버만 남은 경우.
    if (!hash?.port) {
      stale.push(roomId);
      continue;
    }
    // 정원이 찬 방은 game-session이 빼야 하지만, 그 보고를 못 받았을 수 있다.
    if (Number(hash.playerCount) >= Number(hash.capacity)) {
      stale.push(roomId);
      continue;
    }

    alive.push({ roomId, port: Number(hash.port) });
  }

  if (stale.length > 0) {
    await redis.srem(JOINABLE_ROOMS_SET_KEY, ...stale);
    console.log(`[matchmaking] pruned ${stale.length} stale joinable room(s)`);
  }

  if (alive.length === 0) return null;

  // SRANDMEMBER는 count가 집합 크기 이상이면 전체를 정해진 순서로 돌려준다.
  // 그대로 앞에서부터 고르면 난입이 늘 같은 방으로 몰리므로 여기서 무작위로 뽑는다.
  return alive[Math.floor(Math.random() * alive.length)];
}

// 방 배정. match면 진행 중인 방에 난입시키고, 없으면 새 방을 만든다.
// 새 방 기록은 예약일 뿐이라 rooms:joinable에는 넣지 않는다.
// 실제로 첫 플레이어가 접속해 game-session에 방이 생겨야 난입 후보가 된다.
app.post<{ Body: { mode?: AssignMode } }>("/assign", async (req, reply) => {
  const mode: AssignMode = req.body?.mode === "match" ? "match" : "create";

  if (mode === "match") {
    const joinable = await pickJoinableRoom();
    if (joinable) {
      console.log(`[matchmaking] matched into ${joinable.roomId} on ${joinable.port}`);
      return reply.send(joinable);
    }
  }

  const port = await pickLeastLoadedPort();
  if (port === null) {
    return reply.code(503).send({ error: "no game session available" });
  }

  const roomId = randomUUID();
  await redis
    .pipeline()
    .hset(roomHashKey(roomId), {
      port,
      capacity: DEFAULT_ROOM_CAPACITY,
      playerCount: 0,
    })
    // 아무도 접속하지 않은 예약은 스스로 사라진다. 접속이 생기면 game-session이 TTL을 계속 갱신한다.
    .expire(roomHashKey(roomId), PROJECTION_TTL_SECONDS)
    .exec();

  console.log(`[matchmaking] created ${roomId} on ${port}`);
  return reply.send({ roomId, port } satisfies RoomAssignment);
});

// 방 코드로 접속할 포트 조회.
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
console.log(`[matchmaking] listening on ${PORT}, replicas: ${GAME_SESSION_PORTS.join(",")}`);
