import { randomUUID } from "node:crypto";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import type { ClientToServerMessage, StrokeSegment } from "@gachamind/shared";
import { RoomManager, type Room } from "./room.js";
import { handleGuess, handlePlayerLeftDuringGame, startGame } from "./game.js";
import { PORT } from "./config.js";
import { clearOccupancy, syncOccupancy } from "./occupancy.js";
import { redis } from "./redis.js";

/** 채팅 한 줄 최대 길이. 서버가 authority이므로 클라이언트 입력은 여기서 자른다. */
const MAX_CHAT_LENGTH = 200;
/** 한 번에 받을 수 있는 좌표 수. 비정상적으로 큰 패킷을 막는다. */
const MAX_STROKE_POINTS = 256;

const roomManager = new RoomManager();
const wss = new WebSocketServer({ port: PORT });
console.log(`[game-session] pid=${process.pid} listening on ${PORT}`);

interface ConnectionState {
  joinedRoomId: string | null;
  playerId: string | null;
}

function handleJoin(
  socket: WebSocket,
  state: ConnectionState,
  message: Extract<ClientToServerMessage, { type: "join" }>,
): void {
  if (state.joinedRoomId) return;

  const room = roomManager.getOrCreate(message.roomId);
  if (room.isFull) {
    socket.send(JSON.stringify({ type: "room-full", roomId: room.id }));
    socket.close();
    return;
  }

  const playerId = randomUUID();
  const nickname = message.nickname.trim().slice(0, 20) || "익명";
  state.playerId = playerId;
  state.joinedRoomId = message.roomId;
  room.addPlayer({ id: playerId, nickname, socket, score: 0 });

  // 게임 중에 들어온 사람도 다음 라운드부터는 출제할 수 있게 순번 뒤에 붙인다.
  if (room.phase === "playing") room.drawerQueue.push(playerId);

  void syncOccupancy(room);

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
    handleJoin(socket, state, message);
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

  // TODO: 빈 방이면 matchmaking에 정리 콜백 통지.
  if (roomManager.removeIfEmpty(room.id)) {
    void clearOccupancy(room.id);
  } else {
    void syncOccupancy(room);
  }
}

wss.on("connection", (socket: WebSocket) => {
  const state: ConnectionState = { joinedRoomId: null, playerId: null };

  socket.on("message", (raw) => handleMessage(socket, state, raw));
  socket.on("close", () => handleClose(state));
});

/**
 * 프로세스가 내려가면 이 프로세스가 들고 있던 방도 같이 사라진다.
 * Redis 사본을 지우지 않으면 매칭이 죽은 방으로 사람을 계속 보낸다.
 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`[game-session] ${signal}: clearing ${roomManager.roomCount} room projection(s)`);
  wss.close();
  await Promise.all(roomManager.roomIds.map((roomId) => clearOccupancy(roomId)));
  await redis.quit();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
