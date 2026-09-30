import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { LEADERBOARD_LIMIT, type LeaderboardEntry, type LeaderboardSort } from "./types";

/** 정렬 기준 → user_stats 컬럼. SQL 에 그대로 들어가므로 이 표에 있는 값만 쓴다. */
const SORT_COLUMN: Record<LeaderboardSort, string> = {
  totalScore: "total_score",
  wins: "wins",
  bestScore: "best_score",
};

interface EntryRow {
  rank: number;
  username: string;
  nickname: string;
  games_played: number;
  wins: number;
  total_score: string;
  best_score: number;
}

function toEntry(row: EntryRow): LeaderboardEntry {
  return {
    rank: row.rank,
    username: row.username,
    nickname: row.nickname,
    gamesPlayed: row.games_played,
    wins: row.wins,
    totalScore: Number(row.total_score),
    bestScore: row.best_score,
  };
}

/** 회원 순위. user_stats 에 행이 있는(한 판 이상 한) 회원만 오른다. */
@Injectable()
export class LeaderboardService {
  constructor(private readonly dataSource: DataSource) {}

  async top(sort: LeaderboardSort, limit = LEADERBOARD_LIMIT): Promise<LeaderboardEntry[]> {
    const column = SORT_COLUMN[sort];
    const rows: EntryRow[] = await this.dataSource.query(
      `SELECT (RANK() OVER (ORDER BY s.${column} DESC))::int AS rank,
              u.username, s.nickname, s.games_played, s.wins, s.total_score, s.best_score
         FROM user_stats s
         JOIN users u ON u.id = s.user_id
        ORDER BY s.${column} DESC, s.user_id
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), LEADERBOARD_LIMIT)],
    );
    return rows.map(toEntry);
  }

  /** 한 회원의 순위. 계정이 없으면 undefined, 계정은 있는데 한 판도 없으면 null. */
  async rankOf(username: string, sort: LeaderboardSort): Promise<LeaderboardEntry | null | undefined> {
    const column = SORT_COLUMN[sort];
    const rows: (Omit<EntryRow, "rank"> & { rank: number | null })[] = await this.dataSource.query(
      `SELECT CASE WHEN s.user_id IS NULL THEN NULL
                   ELSE (SELECT count(*) FROM user_stats o WHERE o.${column} > s.${column})::int + 1
              END AS rank,
              u.username, s.nickname, s.games_played, s.wins, s.total_score, s.best_score
         FROM users u
         LEFT JOIN user_stats s ON s.user_id = u.id
        WHERE u.username = $1`,
      [username],
    );
    const row = rows[0];
    if (!row) return undefined;
    if (row.rank === null) return null;
    return toEntry(row as EntryRow);
  }
}
