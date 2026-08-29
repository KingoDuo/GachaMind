import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  normalizeRoomCode,
  type ClientToServerMessage,
  type StrokeSegment,
} from "@gachamind/shared";
import { RoomManager, type Room } from "./room.js";
import { handleGuess, handlePlayerLeftDuringGame, startGame } from "./game.js";
import { PORT } from "./config.js";
import {
  clearSessionLoad,
  isRoomAssignedHere,
  publishSessionLoad,
  startProjectionHeartbeat,
  syncOccupancy,
} from "./occupancy.js";
import { notifyRoomClosed } from "./matchmaking.js";
import { closeEventPublisher } from "./events.js";
import { redis } from "./redis.js";

/** 채팅 한 줄 최대 길이. 서버가 authority이므로 클라이언트 입력은 여기서 자른다. */
const MAX_CHAT_LENGTH = 200;
/** 한 번에 받을 수 있는 좌표 수. 비정상적으로 큰 패킷을 막는다. */
const MAX_STROKE_POINTS = 256;

/** 죽은 연결을 정리하는 ping 주기. 로드밸런서 idle timeout(보통 60s)보다 짧아야 유휴 연결이 끊기지 않는다. */
const HEARTBEAT_INTERVAL_MS = 30_000;

const roomManager = new RoomManager();

// WS 와 같은 포트에 HTTP 도 연다. 로드밸런서 헬스체크가 GET /health 로 살아있는지 확인한다.
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "game-session", port: PORT }));
    return;
  }
  res.writeHead(404);
  res.end();
});
const wss = new WebSocketServer({ server });
server.listen(PORT, () => console.log(`[game-session] pid=${process.pid} listening on ${PORT}`));

interface ConnectionState {
  joinedRoomId: string | null;
  playerId: string | null;
  /** 방 배정 확인을 기다리는 중. 그 사이 도착한 join을 중복 처리하지 않으려고 둔다. */
  joining: boolean;
}

async function handleJoin(
  socket: WebSocket,
  state: ConnectionState,
  message: Extract<ClientToServerMessage, { type: "join" }>,
): Promise<void> {
  if (state.joinedRoomId || state.joining) return;
  state.joining = true;

  // 방 코드는 사람이 받아 적어 넘기는 값이라 표기가 흔들린다. 여기서 정규 형태로 맞춰야
  // 같은 방이 대소문자만 다른 코드로 두 개 생기지 않는다.
  const roomId = normalizeRoomCode(message.roomId);

  // 이미 이 프로세스가 들고 있는 방이면 확인이 필요 없다(가장 흔한 경로라 await 없이 지나간다).
  let room = roomManager.get(roomId);
  if (!room) {
    if (!(await isRoomAssignedHere(roomId))) {
      state.joining = false;
      socket.send(JSON.stringify({ type: "room-not-found", roomId }));
      socket.close();
      return;
    }
    // 확인을 기다리는 동안 끊겼으면 죽은 소켓을 방에 넣지 않는다.
    if (socket.readyState !== socket.OPEN) {
      state.joining = false;
      return;
    }
    room = roomManager.getOrCreate(roomId);
  }

  if (room.isFull) {
    state.joining = false;
    socket.send(JSON.stringify({ type: "room-full", roomId: room.id }));
    socket.close();
    return;
  }

  const playerId = randomUUID();
  const nickname = message.nickname.trim().slice(0, 20) || "익명";
  state.playerId = playerId;
  state.joinedRoomId = roomId;
  room.addPlayer({ id: playerId, nickname, socket, score: 0 });

  // 게임 중에 들어온 사람도 다음 라운드부터는 출제할 수 있게 순번 뒤에 붙인다.
  if (room.phase === "playing") room.drawerQueue.push(playerId);

  void syncOccupancy(room);
  void publishSessionLoad(roomManager);

  // 입장자에게는 현재 상태 스냅샷, 나머지에게는 입장 사실만 보낸다.
  room.send(playerId, {
    type: "room-state",
    roomId: room.id,
    you: { id: playerId, nickname, score: 0 },
    players: room.summaries,
    capacity: room.capacity,
    phase: room.phase,
    round: room.round,
    totalRounds: room.totalRounds,
    drawerId: room.drawerId,
    roundEndsAt: room.roundEndsAt,
    wordLength: room.word?.length ?? null,
    strokes: room.strokes,
  });

  room.broadcast(
    {
      type: "player-joined",
      roomId: room.id,
      player: { id: playerId, nickname, score: 0 },
      playerCount: room.size,
    },
    playerId,
  );
  room.notice(`${nickname}님이 입장했습니다.`);
  console.log(`[room ${room.id}] ${nickname} joined (${room.size})`);
  state.joining = false;
}

function handleChat(room: Room, playerId: string, text: string): void {
  const player = room.players.get(playerId);
  if (!player) return;

  const trimmed = text.trim().slice(0, MAX_CHAT_LENGTH);
  if (!trimmed) return;

  // 정답이거나 제시어가 노출되는 발언이면 일반 채팅으로 내보내지 않는다.
  if (handleGuess(room, player, trimmed)) return;

  room.broadcast({
    type: "chat",
    playerId,
    nickname: player.nickname,
    text: trimmed,
    at: Date.now(),
  });
}

function handleDraw(room: Room, playerId: string, stroke: StrokeSegment): void {
  // 그리기 권한은 현재 라운드의 출제자에게만 있다.
  if (room.phase !== "playing" || room.drawerId !== playerId) return;
  if (!Array.isArray(stroke?.points) || stroke.points.length === 0) return;

  const sanitized: StrokeSegment = {
    points: stroke.points.slice(0, MAX_STROKE_POINTS),
    color: String(stroke.color ?? "#171717").slice(0, 32),
    width: Math.min(Math.max(Number(stroke.width) || 4, 1), 48),
  };

  room.addStroke(sanitized);
  room.broadcast({ type: "draw", stroke: sanitized }, playerId);
}

function handleDrawClear(room: Room, playerId: string): void {
  if (room.phase !== "playing" || room.drawerId !== playerId) return;
  room.clearStrokes();
  room.broadcast({ type: "draw-clear" }, playerId);
}

function handleMessage(socket: WebSocket, state: ConnectionState, raw: RawData): void {
  let message: ClientToServerMessage;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (message.type === "join") {
    void handleJoin(socket, state, message);
    return;
  }

  // join 이후에만 처리되는 메시지들.
  if (!state.joinedRoomId || !state.playerId) return;
  const room = roomManager.get(state.joinedRoomId);
  if (!room) return;

  switch (message.type) {
    case "chat":
      handleChat(room, state.playerId, message.text);
      break;
    case "draw":
      handleDraw(room, state.playerId, message.stroke);
      break;
    case "draw-clear":
      handleDrawClear(room, state.playerId);
      break;
    case "start-game":
      startGame(room);
      break;
  }
}

function handleClose(state: ConnectionState): void {
  if (!state.joinedRoomId || !state.playerId) return;
  const room = roomManager.get(state.joinedRoomId);
  if (!room) return;

  const nickname = room.players.get(state.playerId)?.nickname ?? "익명";
  room.removePlayer(state.playerId);

  room.broadcast({
    type: "player-left",
    roomId: room.id,
    playerId: state.playerId,
    nickname,
    playerCount: room.size,
  });
  room.notice(`${nickname}님이 퇴장했습니다.`);

  handlePlayerLeftDuringGame(room, state.playerId);

  if (roomManager.removeIfEmpty(room.id)) {
    void notifyRoomClosed(room.id);
  } else {
    void syncOccupancy(room);
  }
  void publishSessionLoad(roomManager);
}

// 방이 없어도 배정 대상이 되려면 뜨자마자 한 번 보고해야 한다.
void publishSessionLoad(roomManager);
startProjectionHeartbeat(roomManager);

// 하트비트. 브라우저는 ping 에 자동으로 pong 을 보낸다. 한 주기 안에 pong 이 없으면 죽은 연결로 보고 끊는다
// (close 이벤트가 나면서 방에서도 빠진다). 네트워크가 조용히 끊긴 소켓이 방에 유령으로 남는 걸 막는다.
const alive = new WeakSet<WebSocket>();

wss.on("connection", (socket: WebSocket) => {
  const state: ConnectionState = { joinedRoomId: null, playerId: null, joining: false };
  alive.add(socket);

  socket.on("pong", () => alive.add(socket));
  socket.on("message", (raw) => handleMessage(socket, state, raw));
  socket.on("close", () => handleClose(state));
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!alive.has(socket)) {
      socket.terminate();
      continue;
    }
    alive.delete(socket);
    socket.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

/**
 * 프로세스가 내려가면 이 프로세스가 들고 있던 방도 같이 사라진다.
 * Redis 사본을 지우지 않으면 매칭이 죽은 방으로 사람을 계속 보낸다.
 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`[game-session] ${signal}: closing ${roomManager.roomCount} room(s)`);
  clearInterval(heartbeat);
  wss.close();
  server.close();
  await closeEventPublisher();
  await clearSessionLoad();
  await Promise.all(roomManager.allRooms.map((room) => notifyRoomClosed(room.id)));
  await redis.quit();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
