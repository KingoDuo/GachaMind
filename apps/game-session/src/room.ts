import type { WebSocket } from "ws";
import {
  DEFAULT_ROOM_CAPACITY,
  type GamePhase,
  type PlayerSummary,
  type ServerToClientMessage,
  type StrokeSegment,
} from "@gachamind/shared";

/** 한 라운드에 쌓아둘 수 있는 최대 선분 수. 중간 입장자 재생용 버퍼가 무한히 커지는 걸 막는다. */
const MAX_BUFFERED_STROKES = 3000;

export interface Player {
  id: string;
  nickname: string;
  socket: WebSocket;
  score: number;
}

export class Room {
  readonly id: string;
  readonly capacity: number;
  readonly players = new Map<string, Player>();

  phase: GamePhase = "waiting";
  round = 0;
  totalRounds = 0;
  drawerId: string | null = null;
  word: string | null = null;
  roundEndsAt: number | null = null;

  /** 현재 라운드에 그려진 선분. 중간에 들어온 사람에게 그대로 재생해준다. */
  strokes: StrokeSegment[] = [];
  /** 현재 라운드에서 이미 정답을 맞힌 플레이어. */
  readonly solvedPlayerIds = new Set<string>();
  /** 아직 출제하지 않은 플레이어 순번. */
  drawerQueue: string[] = [];
  /** 이번 게임에서 이미 쓴 제시어. 같은 게임 안에서 중복 출제를 피한다. */
  usedWords: string[] = [];
  /** 라운드 제한시간 타이머. 방을 정리할 때 반드시 해제해야 한다. */
  roundTimer: NodeJS.Timeout | null = null;

  constructor(id: string, capacity: number = DEFAULT_ROOM_CAPACITY) {
    this.id = id;
    this.capacity = capacity;
  }

  addPlayer(player: Player): void {
    this.players.set(player.id, player);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.solvedPlayerIds.delete(playerId);
    this.drawerQueue = this.drawerQueue.filter((id) => id !== playerId);
  }

  get size(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= this.capacity;
  }

  get summaries(): PlayerSummary[] {
    return [...this.players.values()].map(({ id, nickname, score }) => ({ id, nickname, score }));
  }

  /** 출제자를 뺀, 아직 정답을 못 맞힌 플레이어 수. 전원 정답 시 라운드 조기 종료를 판단한다. */
  get unsolvedGuesserCount(): number {
    let count = 0;
    for (const player of this.players.values()) {
      if (player.id === this.drawerId) continue;
      if (!this.solvedPlayerIds.has(player.id)) count += 1;
    }
    return count;
  }

  addStroke(stroke: StrokeSegment): void {
    if (this.strokes.length >= MAX_BUFFERED_STROKES) return;
    this.strokes.push(stroke);
  }

  clearStrokes(): void {
    this.strokes = [];
  }

  clearRoundTimer(): void {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  send(playerId: string, message: ServerToClientMessage): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (player.socket.readyState === player.socket.OPEN) {
      player.socket.send(JSON.stringify(message));
    }
  }

  broadcast(message: ServerToClientMessage, excludePlayerId?: string): void {
    const payload = JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.id === excludePlayerId) continue;
      if (player.socket.readyState === player.socket.OPEN) {
        player.socket.send(payload);
      }
    }
  }

  notice(text: string): void {
    this.broadcast({ type: "system", text, at: Date.now() });
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
      room.clearRoundTimer();
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
