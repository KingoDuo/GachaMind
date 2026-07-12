// 서비스 간 공유 "계약". 서버가 늘어나면 이 파일이 경계면(interface)의 단일 출처가 된다.
// 지금은 하나로 두고, 커지면 protocol/auth/events 로 파일을 쪼갠다.

// ────────────────────────────────────────────────────────────
// 방 배정 (web ↔ matchmaking)
// ────────────────────────────────────────────────────────────
export interface RoomAssignment {
  roomId: string;
  port: number;
}

/** 새 방을 만들지(create), 진행 중인 방에 난입할지(match) */
export type AssignMode = "create" | "match";

// ────────────────────────────────────────────────────────────
// 클라이언트 ↔ game-session 실시간 프로토콜
// ────────────────────────────────────────────────────────────
export interface JoinRoomMessage {
  type: "join";
  roomId: string;
  nickname: string;
}

export interface PlayerJoinedMessage {
  type: "player-joined";
  roomId: string;
  playerId: string;
  nickname: string;
  playerCount: number;
}

export interface PlayerLeftMessage {
  type: "player-left";
  roomId: string;
  playerId: string;
  playerCount: number;
}

export interface RoomFullMessage {
  type: "room-full";
  roomId: string;
}

export type ClientToServerMessage = JoinRoomMessage;
export type ServerToClientMessage = PlayerJoinedMessage | PlayerLeftMessage | RoomFullMessage;

// ────────────────────────────────────────────────────────────
// Redis 키 규칙 (matchmaking ↔ game-session 공유 상태)
//   room:{roomId}   Hash → { port, capacity, playerCount }
//   rooms:joinable  Set  → 정원이 남은 roomId들
// ────────────────────────────────────────────────────────────
export function roomHashKey(roomId: string): string {
  return `room:${roomId}`;
}

export const JOINABLE_ROOMS_SET_KEY = "rooms:joinable";

// ────────────────────────────────────────────────────────────
// RabbitMQ 이벤트 (game-session → results-worker)
//   게임 종료 시 발행. worker가 소비해 user DB에 전적을 영속화한다.
// ────────────────────────────────────────────────────────────
export const GAME_EVENTS_QUEUE = "game.events";

export interface GameFinishedEvent {
  type: "game-finished";
  roomId: string;
  finishedAt: string; // ISO8601
  // TODO: 실제 게임 결과 스키마(플레이어별 점수 등)를 게임 로직 구현 시 채운다.
}

export type GameEvent = GameFinishedEvent;
