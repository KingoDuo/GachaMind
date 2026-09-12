import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 전적 조회를 위한 변경.
 *   games.player_count     "몇 명 중 몇 등"을 매번 세지 않도록 저장. 기존 행은 game_players 를 세어 채운다.
 *   game_players(user_id)  "내 전적" 조회의 진입 인덱스. 게스트 행(null)은 뺀다.
 *   user_stats             회원별 누적 집계. 기존 전적으로 채운다.
 * 롤링 배포 중 옛 코드가 잠깐 이 스키마 위에서 돌아도 되게 컬럼 추가만 하고 지우거나 이름을 바꾸지 않는다.
 */
export class HistoryLookup1789200001000 implements MigrationInterface {
  name = "HistoryLookup1789200001000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS player_count integer`);
    await q.query(`
      UPDATE games g
         SET player_count = (SELECT count(*) FROM game_players p WHERE p.game_id = g.id)
       WHERE player_count IS NULL
    `);
    await q.query(`ALTER TABLE games ALTER COLUMN player_count SET NOT NULL`);

    await q.query(`
      CREATE INDEX IF NOT EXISTS game_players_user_id_idx
        ON game_players (user_id) WHERE user_id IS NOT NULL
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id uuid PRIMARY KEY,
        nickname text NOT NULL,
        games_played integer NOT NULL DEFAULT 0,
        wins integer NOT NULL DEFAULT 0,
        total_score bigint NOT NULL DEFAULT 0,
        best_score integer NOT NULL DEFAULT 0,
        last_played_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      INSERT INTO user_stats
        (user_id, nickname, games_played, wins, total_score, best_score, last_played_at)
      SELECT p.user_id,
             (array_agg(p.nickname ORDER BY g.finished_at DESC, g.id DESC))[1],
             count(*),
             count(*) FILTER (WHERE p."rank" = 1),
             sum(p.score),
             max(p.score),
             max(g.finished_at)
        FROM game_players p
        JOIN games g ON g.id = p.game_id
       WHERE p.user_id IS NOT NULL
       GROUP BY p.user_id
      ON CONFLICT (user_id) DO NOTHING
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS user_stats`);
    await q.query(`DROP INDEX IF EXISTS game_players_user_id_idx`);
    await q.query(`ALTER TABLE games DROP COLUMN IF EXISTS player_count`);
  }
}
