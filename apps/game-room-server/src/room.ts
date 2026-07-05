import type { WebSocket } from "ws";

export interface Player {
  id: string;
  nickname: string;
  socket: WebSocket;
}

export class Room {
  readonly id: string;
  readonly players = new Map<string, Player>();

  constructor(id: string) {
    this.id = id;
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

  removeIfEmpty(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room && room.size === 0) {
      this.rooms.delete(roomId);
      console.log(`[room] removed ${roomId}`);
    }
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
