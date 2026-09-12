import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 마이그레이션 도입 시점의 스키마. 이미 배포된 DB 에는 전부 있으므로 IF NOT EXISTS 로 "있으면 그대로".
 *   users         user 서비스가 synchronize: true 로 만들었던 모양(제약 이름까지 TypeORM 이 지어준 그대로).
 *   games         results-worker 가 CREATE TABLE IF NOT EXISTS 로 만들었던 전적 테이블. 이제 user 서비스 소유.
 *   game_players
 */
export class Baseline1789200000000 implements MigrationInterface {
  name = "Baseline1789200000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "username" character varying NOT NULL,
        "nickname" character varying NOT NULL,
        "passwordHash" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS games (
        id uuid PRIMARY KEY,
        room_id text NOT NULL,
        rounds_played integer NOT NULL,
        finished_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS game_players (
        id bigserial PRIMARY KEY,
        game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        player_id uuid NOT NULL,
        user_id uuid,
        nickname text NOT NULL,
        score integer NOT NULL,
        "rank" integer NOT NULL
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS game_players_game_id_idx ON game_players (game_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS game_players_nickname_idx ON game_players (nickname)`);
  }

  public async down(): Promise<void> {
    // 기준선은 되돌리지 않는다(데이터가 있는 테이블을 지우는 마이그레이션은 두지 않는다).
  }
}
