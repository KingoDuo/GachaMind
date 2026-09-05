import { Pool } from "pg";
import type { GameFinishedEvent } from "@gachamind/shared";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://gachamind:gachamind@localhost:5432/gachamind";

const pool = new Pool({ connectionString: DATABASE_URL });

pool.on("error", (err: Error) => console.error("[results-worker] pg pool error:", err.message));

/**
 * 전적 테이블을 만든다.
 * user 서비스의 synchronize가 users를 만들듯, 이 두 테이블은 worker가 소유한다.
 * TODO: user 서비스와 함께 마이그레이션으로 전환한다.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id uuid PRIMARY KEY,
      room_id text NOT NULL,
      rounds_played integer NOT NULL,
      finished_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // user_id는 로그인한 플레이어면 users.id, 게스트면 null.
  // users 테이블의 주인이 user 서비스라 외래키는 아직 걸지 않는다.
  await pool.query(`
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

  await pool.query(`CREATE INDEX IF NOT EXISTS game_players_game_id_idx ON game_players (game_id)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS game_players_nickname_idx ON game_players (nickname)`,
  );

  console.log("[results-worker] schema ready");
}

/**
 * 게임 결과를 저장한다.
 * 이미 저장된 게임이면 아무것도 하지 않고 false를 반환한다.
 * RabbitMQ가 at-least-once라 같은 메시지가 두 번 올 수 있어서, games.id 충돌로 그걸 걸러낸다.
 */
export async function saveGameResult(event: GameFinishedEvent): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO games (id, room_id, rounds_played, finished_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [event.gameId, event.roomId, event.roundsPlayed, event.finishedAt],
    );

    // 이미 처리한 게임. 플레이어 행을 다시 넣으면 전적이 두 배가 된다.
    if (inserted.rowCount === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    for (const player of event.players) {
      await client.query(
        `INSERT INTO game_players (game_id, player_id, user_id, nickname, score, "rank")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          event.gameId,
          player.playerId,
          player.userId ?? null,
          player.nickname,
          player.score,
          player.rank,
        ],
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
