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

export type ClientToServerMessage = JoinRoomMessage;

export type ServerToClientMessage = PlayerJoinedMessage | PlayerLeftMessage;
