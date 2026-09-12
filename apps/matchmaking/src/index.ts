import Fastify from "fastify";
import {
  DEFAULT_ROOM_CAPACITY,
  JOINABLE_ROOMS_SET_KEY,
  PROJECTION_TTL_SECONDS,
  generateRoomCode,
  normalizeRoomCode,
  roomHashKey,
  sessionLoadKey,
  type AssignMode,
  type GamePhase,
  type RoomAssignment,
  type RoomListResponse,
  type RoomSummary,
} from "@gachamind/shared";
import { redis } from "./redis.js";

const PORT = Number(process.env.PORT ?? 4000);

/**
 * 배정 대상 샤드 이름 목록. 실제 후보는 이 중 부하를 보고하고 있는 샤드뿐이다.
 * 로컬은 샤드 이름이 곧 포트("4001,4002"), AWS 는 ECS 서비스 이름 뒤 번호("1,2")다.
 */
const GAME_SESSION_SHARDS = (process.env.GAME_SESSION_SHARDS ?? "4001")
  .split(",")
  .map((s) => s.trim())
  .filter((shard) => shard.length > 0);

/** 난입 후보를 한 번에 뽑아보는 개수. 죽은 방을 만나도 왕복 없이 다음 후보로 넘어가려고 여러 개 뽑는다. */
const JOINABLE_SAMPLE_SIZE = 10;

/** 로비 목록에 한 번에 실어 보내는 방 수 상한. 이보다 방이 많아지면 정렬 인덱스(ZSET)와 페이지네이션이 필요하다. */
const ROOM_LIST_LIMIT = 50;

/** 방 코드 선점 재시도 횟수. 이미 쓰이는 코드를 뽑았을 때만 소모된다. */
const ROOM_CODE_ATTEMPTS = 5;

const app = Fastify({ logger: false });

app.get("/health", async () => ({ status: "ok", service: "matchmaking" }));

/**
 * 살아있는 샤드 중 접속 수가 가장 적은 것을 고른다.
 * 부하를 보고하지 않는 샤드는 죽은 것으로 보고 후보에서 뺀다.
 */
async function pickLeastLoadedShard(): Promise<string | null> {
  const pipeline = redis.pipeline();
  for (const shard of GAME_SESSION_SHARDS) pipeline.hget(sessionLoadKey(shard), "connections");
  const results = await pipeline.exec();

  let bestShard: string | null = null;
  let bestConnections = Number.POSITIVE_INFINITY;

  for (let i = 0; i < GAME_SESSION_SHARDS.length; i += 1) {
    const reported = results?.[i]?.[1] as string | null | undefined;
    if (reported === null || reported === undefined) continue;

    const connections = Number(reported);
    if (connections < bestConnections) {
      bestConnections = connections;
      bestShard = GAME_SESSION_SHARDS[i];
    }
  }

  return bestShard;
}

/**
 * 후보 roomId들의 사본을 읽어 살아있는 방만 돌려준다.
 * rooms:joinable은 Set이라 멤버 단위 TTL이 없어서, 크래시로 사라진 방이나 정원이 찬 방의 흔적이 남는다.
 * 그래서 읽을 때마다 죽은 멤버를 그때그때 인덱스에서 지운다(읽는 쪽 지연 정리).
 * 난입 대상 고르기와 로비 목록이 같은 규칙을 써야 해서 여기 한 곳에 둔다.
 */
async function readJoinableRooms(candidates: string[]): Promise<RoomSummary[]> {
  if (candidates.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const roomId of candidates) pipeline.hgetall(roomHashKey(roomId));
  const results = await pipeline.exec();

  const alive: RoomSummary[] = [];
  const stale: string[] = [];

  // 첫 후보에서 멈추지 않고 전부 확인한다. 그래야 죽은 멤버를 한 번에 지울 수 있다.
  for (let i = 0; i < candidates.length; i += 1) {
    const roomId = candidates[i];
    const hash = results?.[i]?.[1] as Record<string, string> | undefined;

    // 방 기록이 만료됐는데 Set 멤버만 남은 경우.
    if (!hash?.shard) {
      stale.push(roomId);
      continue;
    }
    // 정원이 찬 방은 game-session이 빼야 하지만, 그 보고를 못 받았을 수 있다.
    if (Number(hash.playerCount) >= Number(hash.capacity)) {
      stale.push(roomId);
      continue;
    }

    alive.push({
      roomId,
      shard: hash.shard,
      playerCount: Number(hash.playerCount),
      capacity: Number(hash.capacity),
      // phase는 나중에 추가된 필드라, 옛 사본에는 없을 수 있다.
      phase: (hash.phase as GamePhase) ?? "waiting",
    });
  }

  if (stale.length > 0) {
    await redis.srem(JOINABLE_ROOMS_SET_KEY, ...stale);
    console.log(`[matchmaking] pruned ${stale.length} stale joinable room(s)`);
  }

  return alive;
}

/** 진행 중인 방 하나를 난입 대상으로 고른다. */
async function pickJoinableRoom(): Promise<RoomAssignment | null> {
  const candidates = await redis.srandmember(JOINABLE_ROOMS_SET_KEY, JOINABLE_SAMPLE_SIZE);
  const alive = await readJoinableRooms(candidates);
  if (alive.length === 0) return null;

  // SRANDMEMBER는 count가 집합 크기 이상이면 전체를 정해진 순서로 돌려준다.
  // 그대로 앞에서부터 고르면 난입이 늘 같은 방으로 몰리므로 여기서 무작위로 뽑는다.
  const picked = alive[Math.floor(Math.random() * alive.length)];
  return { roomId: picked.roomId, shard: picked.shard };
}

/**
 * 쓰이지 않는 방 코드를 하나 선점한다.
 * 코드가 5자리로 짧아진 만큼 충돌이 이론상 가능하므로, 생성만 하지 않고 Redis에서 자리를 잡아야 확정이다.
 * HSETNX는 필드가 없을 때만 쓰므로 여러 matchmaking 인스턴스가 동시에 같은 코드를 뽑아도 한 쪽만 이긴다.
 */
async function claimRoomCode(shard: string): Promise<string | null> {
  for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
    const roomId = generateRoomCode();
    const key = roomHashKey(roomId);

    // 선점과 동시에 TTL을 건다. 뒤이은 기록이 실패해도 코드가 영영 묶여 있지 않게 하려는 것이다.
    // NX라 이미 TTL이 있는 살아있는 방의 만료를 늘리지는 않는다.
    const results = await redis
      .pipeline()
      .hsetnx(key, "shard", shard)
      .expire(key, PROJECTION_TTL_SECONDS, "NX")
      .exec();
    if (results?.[0]?.[1] === 1) return roomId;
  }
  return null;
}

// 방 배정. match면 진행 중인 방에 난입시키고, 없으면 새 방을 만든다.
// 새 방 기록은 예약일 뿐이라 rooms:joinable에는 넣지 않는다.
// 실제로 첫 플레이어가 접속해 game-session에 방이 생겨야 난입 후보가 된다.
app.post<{ Body: { mode?: AssignMode } }>("/assign", async (req, reply) => {
  const mode: AssignMode = req.body?.mode === "match" ? "match" : "create";

  if (mode === "match") {
    const joinable = await pickJoinableRoom();
    if (joinable) {
      console.log(`[matchmaking] matched into ${joinable.roomId} on shard ${joinable.shard}`);
      return reply.send(joinable);
    }
  }

  const shard = await pickLeastLoadedShard();
  if (shard === null) {
    return reply.code(503).send({ error: "no game session available" });
  }

  const roomId = await claimRoomCode(shard);
  if (roomId === null) {
    // 재시도를 다 쓸 정도면 코드 공간이 아니라 Redis 쪽이 이상한 상황이다.
    console.error(`[matchmaking] failed to claim a room code after ${ROOM_CODE_ATTEMPTS} attempts`);
    return reply.code(503).send({ error: "room code unavailable" });
  }

  await redis
    .pipeline()
    .hset(roomHashKey(roomId), {
      capacity: DEFAULT_ROOM_CAPACITY,
      playerCount: 0,
    })
    // 아무도 접속하지 않은 예약은 스스로 사라진다. 접속이 생기면 game-session이 TTL을 계속 갱신한다.
    .expire(roomHashKey(roomId), PROJECTION_TTL_SECONDS)
    .exec();

  console.log(`[matchmaking] created ${roomId} on shard ${shard}`);
  return reply.send({ roomId, shard } satisfies RoomAssignment);
});

// 로비 방 목록. 참여 가능한 방(정원이 남은 방)만 보여준다.
// 아직 아무도 접속하지 않은 예약 방은 rooms:joinable에 없어서 목록에도 뜨지 않는다.
app.get("/rooms", async (_req, reply) => {
  const rooms = await readJoinableRooms(await redis.smembers(JOINABLE_ROOMS_SET_KEY));

  // 사람이 많은 방을 위로. 같으면 코드 순으로 고정해 새로고침할 때 순서가 흔들리지 않게 한다.
  rooms.sort((a, b) => b.playerCount - a.playerCount || a.roomId.localeCompare(b.roomId));

  return reply.send({ rooms: rooms.slice(0, ROOM_LIST_LIMIT) } satisfies RoomListResponse);
});

// 방 코드로 접속할 샤드 조회.
app.get<{ Params: { roomId: string } }>("/rooms/:roomId", async (req, reply) => {
  // 사람이 받아 적어 넘긴 코드일 수 있으므로 표기 차이를 먼저 흡수한다.
  const roomId = normalizeRoomCode(req.params.roomId);
  const hash = await redis.hgetall(roomHashKey(roomId));
  if (!hash.shard) {
    return reply.code(404).send({ error: "room not found" });
  }
  return reply.send({ roomId, shard: hash.shard } satisfies RoomAssignment);
});

// game-session이 빈 방을 정리했을 때 호출하는 콜백.
// 매칭 인덱스의 주인은 matchmaking이므로 키 삭제도 여기서만 한다.
app.delete<{ Params: { roomId: string } }>("/rooms/:roomId", async (req, reply) => {
  const roomId = normalizeRoomCode(req.params.roomId);
  await redis.pipeline().del(roomHashKey(roomId)).srem(JOINABLE_ROOMS_SET_KEY, roomId).exec();
  console.log(`[matchmaking] closed room ${roomId}`);
  return reply.code(204).send();
});

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`[matchmaking] listening on ${PORT}, shards: ${GAME_SESSION_SHARDS.join(",")}`);
