// 서비스 간 공유 "계약". 서버가 늘어나면 이 파일이 경계면(interface)의 단일 출처가 된다.
// 지금은 하나로 두고, 커지면 protocol/auth/events 로 파일을 쪼갠다.

// 방 배정 (web - matchmaking)

export interface RoomAssignment {
  roomId: string;
  port: number;
}

/** 새 방을 만들지(create), 진행 중인 방에 난입할지(match) */
export type AssignMode = "create" | "match";

// 게임 규칙 상수. 서버가 authority지만 클라이언트도 진행바 계산에 쓴다.

/** 방 하나의 최대 인원. matchmaking(Redis 기록)과 game-session(Room 정원)이 값을 공유한다. */
export const DEFAULT_ROOM_CAPACITY = 100;

/** 한 라운드 제한시간. */
export const ROUND_DURATION_MS = 60_000;

/** 게임을 시작할 수 있는 최소 인원. */
export const MIN_PLAYERS_TO_START = 2;

/** 한 게임의 최대 라운드 수. 기본은 인원수(전원이 한 번씩 출제)지만 이 값에서 자른다. */
export const MAX_ROUNDS = 10;

// 클라이언트 - game-session 실시간 프로토콜

/** 게임 진행 단계. */
export type GamePhase = "waiting" | "playing" | "ended";

/** 다른 참가자에게 노출되는 플레이어 정보. socket 같은 서버 내부 상태는 담지 않는다. */
export interface PlayerSummary {
  id: string;
  nickname: string;
  score: number;
}

/** 캔버스 좌표. 창 크기가 서로 다른 클라이언트끼리 호환되도록 0~1로 정규화해서 주고받는다. */
export interface Point {
  x: number;
  y: number;
}

/** 선 하나를 이루는 좌표 묶음. 프레임 단위로 모아 보낸다. */
export interface StrokeSegment {
  points: Point[];
  color: string;
  width: number;
}

// 클라이언트가 보내는 메시지

export interface JoinRoomMessage {
  type: "join";
  roomId: string;
  nickname: string;
}

export interface ChatInputMessage {
  type: "chat";
  text: string;
}

export interface DrawInputMessage {
  type: "draw";
  stroke: StrokeSegment;
}

export interface DrawClearInputMessage {
  type: "draw-clear";
}

export interface StartGameMessage {
  type: "start-game";
}

export type ClientToServerMessage =
  | JoinRoomMessage
  | ChatInputMessage
  | DrawInputMessage
  | DrawClearInputMessage
  | StartGameMessage;

// 서버가 보내는 메시지

/**
 * 입장한 본인에게만 보내는 현재 상태 스냅샷.
 * 나중에 들어온 사람도 기존 참가자와 이미 그려진 그림을 볼 수 있게 한다.
 */
export interface RoomStateMessage {
  type: "room-state";
  roomId: string;
  you: PlayerSummary;
  players: PlayerSummary[];
  capacity: number;
  phase: GamePhase;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  /** 진행 중인 라운드의 남은 시간 기준시각(epoch ms). 대기 중이면 null. */
  roundEndsAt: number | null;
  /** 비출제자에게는 제시어 대신 글자 수만 준다. */
  wordLength: number | null;
  strokes: StrokeSegment[];
}

export interface PlayerJoinedMessage {
  type: "player-joined";
  roomId: string;
  player: PlayerSummary;
  playerCount: number;
}

export interface PlayerLeftMessage {
  type: "player-left";
  roomId: string;
  playerId: string;
  nickname: string;
  playerCount: number;
}

export interface RoomFullMessage {
  type: "room-full";
  roomId: string;
}

export interface ChatBroadcastMessage {
  type: "chat";
  playerId: string;
  nickname: string;
  text: string;
  at: number;
}

/** 입퇴장, 정답, 라운드 안내 등 서버가 만드는 알림. */
export interface SystemNoticeMessage {
  type: "system";
  text: string;
  at: number;
}

export interface DrawBroadcastMessage {
  type: "draw";
  stroke: StrokeSegment;
}

export interface DrawClearedMessage {
  type: "draw-clear";
}

export interface GameStartedMessage {
  type: "game-started";
  totalRounds: number;
}

/** word는 출제자에게 보내는 사본에만 채워진다. */
export interface RoundStartedMessage {
  type: "round-started";
  round: number;
  totalRounds: number;
  drawerId: string;
  drawerNickname: string;
  roundEndsAt: number;
  wordLength: number;
  word?: string;
}

export interface RoundEndedMessage {
  type: "round-ended";
  round: number;
  word: string;
  players: PlayerSummary[];
}

export interface CorrectAnswerMessage {
  type: "correct-answer";
  playerId: string;
  nickname: string;
  players: PlayerSummary[];
}

export interface GameEndedMessage {
  type: "game-ended";
  players: PlayerSummary[];
}

export type ServerToClientMessage =
  | RoomStateMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | RoomFullMessage
  | ChatBroadcastMessage
  | SystemNoticeMessage
  | DrawBroadcastMessage
  | DrawClearedMessage
  | GameStartedMessage
  | RoundStartedMessage
  | RoundEndedMessage
  | CorrectAnswerMessage
  | GameEndedMessage;

/** 정답 비교용 정규화. 공백과 대소문자 차이는 무시한다. */
export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

// Redis 키 규칙 (matchmaking - game-session 공유 상태)
//   room:{roomId}   Hash: { port, capacity, playerCount }
//   rooms:joinable  Set:  정원이 남은 roomId들

export function roomHashKey(roomId: string): string {
  return `room:${roomId}`;
}

export const JOINABLE_ROOMS_SET_KEY = "rooms:joinable";

// RabbitMQ 이벤트 (game-session - results-worker)
//   게임 종료 시 발행. worker가 소비해 user DB에 전적을 영속화한다.

export const GAME_EVENTS_QUEUE = "game.events";

export interface GameFinishedEvent {
  type: "game-finished";
  roomId: string;
  finishedAt: string; // ISO8601
  // TODO: 실제 게임 결과 스키마(플레이어별 점수 등)를 게임 로직 구현 시 채운다.
}

export type GameEvent = GameFinishedEvent;
