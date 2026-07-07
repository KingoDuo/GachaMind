import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientToServerMessage, ServerToClientMessage } from "@gachamind/shared";
import { RoomManager } from "./room.js";

const PORT = Number(process.env.PORT ?? 4001);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";

const roomManager = new RoomManager();

/** 방이 비어서 정리됐을 때 web의 room-registry에도 알려준다(실패해도 게임 로직엔 영향 없음). */
function notifyRoomReleased(roomId: string): void {
  fetch(`${WEB_ORIGIN}/api/rooms/${roomId}`, { method: "DELETE" }).catch((err) => {
    console.error(`[room ${roomId}] failed to notify web of release:`, err);
  });
}
const wss = new WebSocketServer({ port: PORT });

console.log(`[game-room-server] pid=${process.pid} listening on ${PORT}`);

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
      playerId = randomUUID();
      joinedRoomId = message.roomId;
      room.addPlayer({ id: playerId, nickname: message.nickname, socket });

      const payload: ServerToClientMessage = {
        type: "player-joined",
        roomId: room.id,
        playerId,
        nickname: message.nickname,
        playerCount: room.size,
      };
      room.broadcast(payload);
      console.log(`[room ${room.id}] ${message.nickname} joined (${room.size} players)`);
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
    console.log(`[room ${room.id}] player left (${room.size} players)`);
    if (roomManager.removeIfEmpty(room.id)) {
      notifyRoomReleased(room.id);
    }
  });
});

setInterval(() => {
  console.log(
    `[metrics] pid=${process.pid} port=${PORT} rooms=${roomManager.roomCount} connections=${roomManager.totalConnections}`,
  );
}, 30000).unref();
