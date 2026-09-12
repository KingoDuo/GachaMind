import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * 게임 한 판의 플레이어 한 명 결과.
 * user_id 는 로그인한 플레이어면 users.id, 게스트면 null. 게스트 행은 "누구"에게도 귀속되지 않는다.
 * nickname 은 게임 당시 값의 스냅샷이다(지금 닉네임은 users 가 답한다).
 * users 로의 외래키는 두지 않는다 — 게스트 행이 있고, 전적은 계정이 사라져도 판의 기록으로 남는다.
 */
@Entity("game_players")
@Index("game_players_game_id_idx", ["gameId"])
export class GamePlayer {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id: string;

  @Column({ name: "game_id", type: "uuid" })
  gameId: string;

  @Column({ name: "player_id", type: "uuid" })
  playerId: string;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string | null;

  @Column({ type: "text" })
  nickname: string;

  @Column({ type: "integer" })
  score: number;

  @Column({ type: "integer" })
  rank: number;
}
