import { randomUUID } from "node:crypto";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import type { ClientToServerMessage, ServerToClientMessage } from "@gachamind/shared";
import { RoomManager } from "./room.js";

const PORT = Number(process.env.PORT ?? 4001);

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
    const full: ServerToClientMessage = { type: "room-full", roomId: room.id };
    socket.send(JSON.stringify(full));
    socket.close();
    return;
  }

  state.playerId = randomUUID();
  state.joinedRoomId = message.roomId;
  room.addPlayer({ id: state.playerId, nickname: message.nickname, socket });

  // TODO: Redis occupancy 동기화 + matchmaking 연동 (방 존재/포트 등록).
  const payload: ServerToClientMessage = {
    type: "player-joined",
    roomId: room.id,
    playerId: state.playerId,
    nickname: message.nickname,
    playerCount: room.size,
  };
  room.broadcast(payload);
  console.log(`[room ${room.id}] ${message.nickname} joined (${room.size})`);
}

function handleMessage(socket: WebSocket, state: ConnectionState, raw: RawData): void {
  let message: ClientToServerMessage;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }

  switch (message.type) {
    case "join":
      handleJoin(socket, state, message);
      break;
    // TODO: 게임 프로토콜(draw/chat/정답판정/게임루프) 확장 지점.
  }
}

function handleClose(state: ConnectionState): void {
  if (!state.joinedRoomId || !state.playerId) return;
  const room = roomManager.get(state.joinedRoomId);
  if (!room) return;
  room.removePlayer(state.playerId);

  const payload: ServerToClientMessage = {
    type: "player-left",
    roomId: room.id,
    playerId: state.playerId,
    playerCount: room.size,
  };
  room.broadcast(payload);
  // TODO: 빈 방이면 matchmaking에 정리 콜백 통지.
  roomManager.removeIfEmpty(room.id);
}

wss.on("connection", (socket: WebSocket) => {
  const state: ConnectionState = { joinedRoomId: null, playerId: null };

  socket.on("message", (raw) => handleMessage(socket, state, raw));
  socket.on("close", () => handleClose(state));
});
