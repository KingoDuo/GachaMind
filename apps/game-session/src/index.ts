import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientToServerMessage, ServerToClientMessage } from "@gachamind/shared";
import { RoomManager } from "./room.js";

const PORT = Number(process.env.PORT ?? 4001);

const roomManager = new RoomManager();
const wss = new WebSocketServer({ port: PORT });
console.log(`[game-session] pid=${process.pid} listening on ${PORT}`);

wss.on("connection", (socket: WebSocket) => {
  let joinedRoomId: string | null = null;
  let playerId: string | null = null;

  socket.on("message", (raw) => {
    let message: ClientToServerMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "join" && !joinedRoomId) {
      const room = roomManager.getOrCreate(message.roomId);
      if (room.isFull) {
        const full: ServerToClientMessage = { type: "room-full", roomId: room.id };
        socket.send(JSON.stringify(full));
        socket.close();
        return;
      }

      playerId = randomUUID();
      joinedRoomId = message.roomId;
      room.addPlayer({ id: playerId, nickname: message.nickname, socket });

      // TODO: Redis occupancy 동기화 + matchmaking 연동 (방 존재/포트 등록).
      // TODO: 게임 프로토콜(draw/chat/정답판정/게임루프)은 여기서부터 확장.
      const payload: ServerToClientMessage = {
        type: "player-joined",
        roomId: room.id,
        playerId,
        nickname: message.nickname,
        playerCount: room.size,
      };
      room.broadcast(payload);
      console.log(`[room ${room.id}] ${message.nickname} joined (${room.size})`);
    }
  });

  socket.on("close", () => {
    if (!joinedRoomId || !playerId) return;
    const room = roomManager.get(joinedRoomId);
    if (!room) return;
    room.removePlayer(playerId);

    const payload: ServerToClientMessage = {
      type: "player-left",
      roomId: room.id,
      playerId,
      playerCount: room.size,
    };
    room.broadcast(payload);
    // TODO: 빈 방이면 matchmaking에 정리 콜백 통지.
    roomManager.removeIfEmpty(room.id);
  });
});
