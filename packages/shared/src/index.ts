// 서비스 간 공유 "계약". 서버가 늘어나면 이 파일이 경계면(interface)의 단일 출처가 된다.
// 지금은 하나로 두고, 커지면 protocol/auth/events 로 파일을 쪼갠다.

// 방 배정 (web - matchmaking)

export interface RoomAssignment {
  roomId: string;
  /**
   * 방이 열려 있는 game-session 샤드의 이름. 브라우저는 이 값으로 접속 주소를 만든다
   * (프로덕션은 ALB 경로 /gs/{shard}, 로컬은 샤드 이름이 곧 포트라 ws://host:{shard}).
   * 포트가 아니라 이름인 이유: 인스턴스가 여러 대면 같은 포트가 여러 샤드에 있어 포트로는 샤드를 못 가린다.
   */
  shard: string;
}

/** 새 방을 만들지(create), 진행 중인 방에 난입할지(match) */
export type AssignMode = "create" | "match";

/** 로비가 받는 방 목록 응답. */
export interface RoomListResponse {
  rooms: RoomSummary[];
}

// 계정 / 세션 (web - user - game-session)
//
// user 서비스는 nest build(tsc, rootDir=src) 제약으로 이 패키지를 import하지 못한다.
// 그래서 아래 규칙은 apps/user/src/auth/rules.ts 에 같은 값으로 한 벌 더 있다. 바꿀 때 둘 다 바꾼다.

/** 화면에 보이는 이름. 게스트와 계정 모두 같은 규칙을 쓴다. */
export const MAX_NICKNAME_LENGTH = 20;

/** 로그인 아이디. 공백을 뺀 출력 가능한 ASCII(영문·숫자·특수문자)만. 길이 상한은 없다. */
export const USERNAME_PATTERN = /^[\x21-\x7E]+$/;

/** 비밀번호. 아이디 규칙에 공백만 더 허용한다. */
export const PASSWORD_PATTERN = /^[\x20-\x7E]+$/;

/** bcrypt는 72바이트 이후를 무시하므로 그 앞에서 자른다. */
export const MAX_PASSWORD_LENGTH = 72;

/**
 * web(BFF)이 브라우저에 심는 세션 쿠키 이름. 값은 user 서비스가 발급한 JWT다.
 * httpOnly라 JS는 못 읽지만, 같은 도메인(로컬은 같은 호스트)의 game-session WS 핸드셰이크에는 자동으로 실린다.
 * game-session은 이 쿠키로 "누구"인지 안다. 없으면 게스트.
 */
export const SESSION_COOKIE_NAME = "gachamind_session";

/** 세션(JWT·쿠키) 수명. refresh 토큰 없이 단순하게 간다. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** user 서비스가 서명하는 JWT 본문. game-session이 같은 JWT_SECRET으로 로컬 검증해 읽는다. */
export interface SessionTokenPayload {
  /** users.id */
  sub: string;
  username: string;
  nickname: string;
}

/** 브라우저에 노출되는 계정 정보. passwordHash 같은 내부 값은 담지 않는다. */
export interface AuthUser {
  id: string;
  username: string;
  nickname: string;
}

/** user 서비스의 /auth/signup, /auth/login 응답. web은 accessToken을 쿠키로 바꾸고 user만 브라우저에 준다. */
export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

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
  JoinRoomMessage | ChatInputMessage | DrawInputMessage | DrawClearInputMessage | StartGameMessage;

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
  /**
   * 진행 중인 라운드의 남은 시간(ms). 대기 중이면 null.
   * 절대 시각(epoch)이 아니라 서버가 보내는 순간 계산한 남은 양이다.
   * 클라이언트 시계가 서버와 어긋나도 타이머가 틀어지지 않도록, 클라는 받은 시각부터 자기 시계로만 센다.
   */
  remainingMs: number | null;
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

/** 배정된 적 없는 방 코드로 접속했을 때. 유령 방이 생기지 않도록 game-session이 입장을 거절한다. */
export interface RoomNotFoundMessage {
  type: "room-not-found";
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
  /** 라운드 남은 시간(ms). RoomStateMessage.remainingMs와 같은 의미. */
  remainingMs: number;
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
  | RoomNotFoundMessage
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

// 방 코드 (사람이 부르고 받아 적는 값)

/**
 * 방 코드 글자 집합. Crockford Base32(0-9 + A-Z에서 I·L·O·U 제외).
 * 눈으로 헷갈리는 글자를 빼서 받아 적기 쉽게 하고, 크기가 32라 무작위 바이트를 편향 없이 잘라 쓸 수 있다.
 */
export const ROOM_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 방 코드 길이. 5자리면 32^5 ≈ 3,350만 가지라 동시에 열려 있는 방 규모에선 충돌이 사실상 없다. */
export const ROOM_CODE_LENGTH = 5;

/**
 * 새 방 코드를 만든다. 주인은 matchmaking이고, 충돌은 Redis 선점(HSETNX)으로 최종 판정한다.
 * getRandomValues는 브라우저·Node 양쪽에 있어서 shared에서 그대로 쓸 수 있다.
 */
export function generateRoomCode(length: number = ROOM_CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let code = "";
  // 알파벳이 32개라 하위 5비트만 쓰면 모든 글자가 같은 확률로 나온다.
  for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte & 31];
  return code;
}

/**
 * 사용자가 입력한 방 코드를 정규 형태로 맞춘다.
 * 대소문자, 사이에 낀 공백·하이픈, 그리고 O/0·I/L/1 오타를 흡수한다.
 * 코드를 받는 모든 입구(web 입장 폼, matchmaking 조회, game-session join)에서 통과시켜야
 * 같은 방이 표기만 다른 코드로 갈라지지 않는다.
 */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/** 정규화까지 마친 코드가 방 코드 형식인지. 형식이 틀리면 Redis를 찌를 필요도 없다. */
export function isRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));
}

// Redis 키 규칙 (matchmaking - game-session 공유 상태)
//   room:{roomId}    Hash: { shard, capacity, playerCount, phase }
//   rooms:joinable   Set:  정원이 남은 roomId들
//   session:{shard}  Hash: { shard, rooms, connections }  샤드별 부하

/**
 * Redis에 기록되는 방 사본. 진짜 상태는 game-session 인메모리이고 이건 matchmaking이 읽는 projection이다.
 * game-session이 갱신하고, matchmaking은 배정 후보를 고를 때만 읽는다.
 */
export interface RoomProjection {
  /** 이 방이 열려 있는 game-session 샤드 이름. */
  shard: string;
  capacity: number;
  playerCount: number;
  /** 로비 목록에서 "대기 중/게임 중"을 구분하려고 같이 싣는다. */
  phase: GamePhase;
}

/** 로비 방 목록의 한 줄. matchmaking이 projection을 모아 web에 준다. */
export interface RoomSummary extends RoomProjection {
  roomId: string;
}

export function roomHashKey(roomId: string): string {
  return `room:${roomId}`;
}

export const JOINABLE_ROOMS_SET_KEY = "rooms:joinable";

/**
 * game-session이 Redis에 남기는 사본(방, replica 부하)의 만료 시간.
 * 프로세스가 크래시하거나 정리 콜백이 실패해도 이 시간이 지나면 기록이 스스로 사라진다.
 */
export const PROJECTION_TTL_SECONDS = 60;

/** game-session이 사본의 TTL을 갱신하는 주기. TTL보다 충분히 짧아야 한다. */
export const PROJECTION_HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * game-session 샤드가 자기 부하를 알리는 키.
 * matchmaking이 새 방을 어느 샤드에 둘지(least-connections) 고를 때 읽는다.
 * 키가 없으면 그 샤드는 죽은 것으로 본다.
 */
export function sessionLoadKey(shard: string): string {
  return `session:${shard}`;
}

/** 샤드 하나의 현재 부하. 값의 주인은 game-session 인메모리이고 Redis는 그 사본이다. */
export interface SessionLoad {
  shard: string;
  rooms: number;
  connections: number;
}

// RabbitMQ 이벤트 (game-session - results-worker)
//   게임 종료 시 발행. worker가 소비해 user DB에 전적을 영속화한다.

export const GAME_EVENTS_QUEUE = "game.events";

/** 게임 한 판의 플레이어별 결과. */
export interface GameResultPlayer {
  playerId: string;
  /** 로그인한 플레이어면 users.id, 게스트면 null. 전적은 이 값이 있는 행만 "누구"에게 귀속된다. */
  userId: string | null;
  nickname: string;
  score: number;
  /** 1등부터. 동점이면 같은 등수를 준다. */
  rank: number;
}

export interface GameFinishedEvent {
  type: "game-finished";
  /**
   * 게임 한 판의 고유 id.
   * RabbitMQ는 at-least-once라 같은 메시지가 두 번 올 수 있다.
   * worker가 이 값으로 이미 저장한 게임인지 판별해 중복 적재를 막는다.
   */
  gameId: string;
  roomId: string;
  /** ISO8601 */
  finishedAt: string;
  /** 실제로 진행된 라운드 수. 인원이 빠져 조기 종료되면 계획보다 적다. */
  roundsPlayed: number;
  /**
   * 게임이 끝나는 시점에 방에 남아 있던 플레이어만 담긴다.
   * 중간에 나간 사람의 점수는 인메모리에서 함께 사라지므로 기록되지 않는다.
   */
  players: GameResultPlayer[];
}

export type GameEvent = GameFinishedEvent;
