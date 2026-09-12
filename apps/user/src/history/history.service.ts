import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { GameFinishedDto } from "./dto/game-finished.dto";
import {
  PLAYER_GAMES_PAGE_LIMIT,
  PLAYER_GAMES_PAGE_SIZE,
  type PlayerGameRecord,
  type PlayerGamesResponse,
  type PlayerStats,
} from "./types";
import { UserStats } from "./user-stats.entity";

const EMPTY_STATS: PlayerStats = {
  gamesPlayed: 0,
  wins: 0,
  totalScore: 0,
  bestScore: 0,
  lastPlayedAt: null,
};

/**
 * 전적(games / game_players / user_stats)의 읽기·쓰기를 한 곳에 모은다.
 * 쓰기는 results-worker 가 큐에서 받은 이벤트를 내부 API 로 넘겨줄 때만 일어난다.
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserStats) private readonly stats: Repository<UserStats>,
  ) {}

  /**
   * 게임 결과를 저장한다. 이미 저장된 게임이면 아무것도 하지 않고 false.
   * RabbitMQ 가 at-least-once 라 같은 이벤트가 두 번 올 수 있어 games.id 충돌로 걸러낸다.
   * 회원 집계(user_stats)도 같은 트랜잭션에서 갱신하므로 중복 이벤트가 집계를 두 번 올리는 일은 없다.
   */
  async saveGameResult(event: GameFinishedDto): Promise<boolean> {
    return this.dataSource.transaction(async (tx) => {
      const inserted: unknown[] = await tx.query(
        `INSERT INTO games (id, room_id, rounds_played, finished_at, player_count)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [event.gameId, event.roomId, event.roundsPlayed, event.finishedAt, event.players.length],
      );
      // 이미 처리한 게임. 플레이어 행을 다시 넣으면 전적이 두 배가 된다.
      if (inserted.length === 0) return false;

      for (const player of event.players) {
        await tx.query(
          `INSERT INTO game_players (game_id, player_id, user_id, nickname, score, "rank")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [event.gameId, player.playerId, player.userId ?? null, player.nickname, player.score, player.rank],
        );
        if (!player.userId) continue;

        // 회원 누적 전적에 한 판을 더한다. 첫 판이면 행을 만든다.
        // total_score 는 bigint, best_score 는 integer 라 같은 값이라도 파라미터를 따로 준다(타입 추론 충돌 방지).
        await tx.query(
          `INSERT INTO user_stats
             (user_id, nickname, games_played, wins, total_score, best_score, last_played_at)
           VALUES ($1, $2, 1, $3::int, $4::bigint, $5::int, $6::timestamptz)
           ON CONFLICT (user_id) DO UPDATE SET
             games_played   = user_stats.games_played + 1,
             wins           = user_stats.wins + EXCLUDED.wins,
             total_score    = user_stats.total_score + EXCLUDED.total_score,
             best_score     = GREATEST(user_stats.best_score, EXCLUDED.best_score),
             -- 이벤트가 순서 없이 와도 "가장 최근"이 유지되게 큰 쪽을 남긴다. 닉네임도 그 판의 것을 따른다.
             nickname       = CASE WHEN EXCLUDED.last_played_at >= user_stats.last_played_at
                                   THEN EXCLUDED.nickname ELSE user_stats.nickname END,
             last_played_at = GREATEST(user_stats.last_played_at, EXCLUDED.last_played_at),
             updated_at     = now()`,
          [player.userId, player.nickname, player.rank === 1 ? 1 : 0, player.score, player.score, event.finishedAt],
        );
      }
      return true;
    });
  }

  /** 회원의 누적 전적. 한 판도 없으면 0 으로 채운 값. */
  async getStats(userId: string): Promise<PlayerStats> {
    const row = await this.stats.findOne({ where: { userId } });
    if (!row) return EMPTY_STATS;
    return {
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      totalScore: Number(row.totalScore),
      bestScore: row.bestScore,
      lastPlayedAt: row.lastPlayedAt.toISOString(),
    };
  }

  /** 회원이 참가한 게임을 최신순으로 한 페이지. 커서가 깨졌으면 null(호출자가 400 으로 답한다). */
  async listGames(
    userId: string,
    options: { limit?: number; cursor?: string | null },
  ): Promise<PlayerGamesResponse | null> {
    const limit = Math.min(Math.max(options.limit ?? PLAYER_GAMES_PAGE_SIZE, 1), PLAYER_GAMES_PAGE_LIMIT);
    const after = options.cursor ? decodeCursor(options.cursor) : null;
    if (options.cursor && !after) return null;

    // limit + 1 개를 읽어 다음 페이지가 있는지 본다.
    const rows: {
      game_id: string;
      room_id: string;
      finished_at: Date;
      rounds_played: number;
      player_count: number;
      score: number;
      rank: number;
    }[] = await this.dataSource.query(
      `SELECT g.id AS game_id, g.room_id, g.finished_at, g.rounds_played, g.player_count, p.score, p."rank"
         FROM game_players p
         JOIN games g ON g.id = p.game_id
        WHERE p.user_id = $1
          AND ($2::timestamptz IS NULL OR (g.finished_at, g.id) < ($2::timestamptz, $3::uuid))
        ORDER BY g.finished_at DESC, g.id DESC
        LIMIT $4`,
      [userId, after?.finishedAt ?? null, after?.gameId ?? null, limit + 1],
    );

    const games = rows.slice(0, limit).map<PlayerGameRecord>((row) => ({
      gameId: row.game_id,
      roomId: row.room_id,
      finishedAt: row.finished_at.toISOString(),
      roundsPlayed: row.rounds_played,
      playerCount: row.player_count,
      score: row.score,
      rank: row.rank,
    }));
    const last = games[games.length - 1];
    return { games, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
  }
}

/**
 * 페이지 커서. "이 게임보다 오래된 것부터"를 (finished_at, game_id)로 가리킨다.
 * offset 이 아니라 keyset 이라, 보는 중에 새 게임이 쌓여도 같은 줄이 두 번 나오지 않는다.
 */
function encodeCursor(record: PlayerGameRecord): string {
  return Buffer.from(`${record.finishedAt}|${record.gameId}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { finishedAt: string; gameId: string } | null {
  const [finishedAt, gameId] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!finishedAt || !gameId || Number.isNaN(Date.parse(finishedAt))) return null;
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) return null;
  return { finishedAt, gameId };
}
