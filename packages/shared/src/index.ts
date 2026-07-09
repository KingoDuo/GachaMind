export interface RoomAssignment {
  roomId: string;
  port: number;
}

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

// game-room-server와 web이 방 매칭 상태를 공유하기 위해 쓰는 Redis 키 규칙.
// room:{roomId} Hash: port/capacity/playerCount, rooms:joinable Set: 정원이 남은 roomId들.
export function roomHashKey(roomId: string): string {
  return `room:${roomId}`;
}

export const JOINABLE_ROOMS_SET_KEY = "rooms:joinable";
