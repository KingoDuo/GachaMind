import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 리더보드 정렬 기준별 인덱스. 상위 N 명 조회와 "내 순위"(나보다 큰 값의 개수)를 모두 받친다.
 * user_id 는 동점일 때 표시 순서를 고정하는 두 번째 키.
 */
export class LeaderboardIndexes1789200002000 implements MigrationInterface {
  name = "LeaderboardIndexes1789200002000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE INDEX IF NOT EXISTS user_stats_total_score_idx ON user_stats (total_score DESC, user_id)`,
    );
    await q.query(`CREATE INDEX IF NOT EXISTS user_stats_wins_idx ON user_stats (wins DESC, user_id)`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS user_stats_best_score_idx ON user_stats (best_score DESC, user_id)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS user_stats_best_score_idx`);
    await q.query(`DROP INDEX IF EXISTS user_stats_wins_idx`);
    await q.query(`DROP INDEX IF EXISTS user_stats_total_score_idx`);
  }
}
