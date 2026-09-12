// 전적 조회 응답. packages/shared 의 PlayerStats / PlayerGameRecord / PlayerGamesResponse / ProfileResponse 와 같은 모양.
// (nest build 가 rootDir=src 밖의 TS 를 못 가져와서 여기 한 벌 더 둔다. 바꿀 때 둘 다 바꾼다.)

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  totalScore: number;
  bestScore: number;
  lastPlayedAt: string | null;
}

export interface PlayerGameRecord {
  gameId: string;
  roomId: string;
  finishedAt: string;
  roundsPlayed: number;
  playerCount: number;
  score: number;
  rank: number;
}

export interface PlayerGamesResponse {
  games: PlayerGameRecord[];
  nextCursor: string | null;
}

/** 한 페이지에 싣는 게임 수의 기본값과 상한. */
export const PLAYER_GAMES_PAGE_SIZE = 20;
export const PLAYER_GAMES_PAGE_LIMIT = 50;
