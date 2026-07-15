import type { WebSocket } from "ws";
import { DEFAULT_ROOM_CAPACITY } from "@gachamind/shared";

export interface Player {
  id: string;
  nickname: string;
  socket: WebSocket;
}

export class Room {
  readonly id: string;
  readonly capacity: number;
  readonly players = new Map<string, Player>();

  constructor(id: string, capacity: number = DEFAULT_ROOM_CAPACITY) {
    this.id = id;
    this.capacity = capacity;
  }

  addPlayer(player: Player): void {
    this.players.set(player.id, player);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
  }

  get size(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= this.capacity;
  }

  broadcast(message: unknown, excludePlayerId?: string): void {
    const payload = JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.id === excludePlayerId) continue;
      if (player.socket.readyState === player.socket.OPEN) {
        player.socket.send(payload);
      }
    }
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  getOrCreate(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(roomId);
      this.rooms.set(roomId, room);
      console.log(`[room] created ${roomId}`);
    }
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** 방을 지웠으면 true를 반환한다(비어있지 않거나 존재하지 않으면 false). */
  removeIfEmpty(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (room && room.size === 0) {
      this.rooms.delete(roomId);
      console.log(`[room] removed ${roomId}`);
      return true;
    }
    return false;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get totalConnections(): number {
    let total = 0;
    for (const room of this.rooms.values()) total += room.size;
    return total;
  }
}
