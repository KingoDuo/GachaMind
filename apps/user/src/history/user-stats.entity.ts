import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * 회원별 누적 전적. 게임을 저장하는 트랜잭션에서 함께 갱신하므로 항상 game_players 와 일치한다.
 * 프로필 상단 숫자와(나중에) 랭킹은 이 표만 읽는다. nickname 은 마지막 게임 당시 값(랭킹 표시용 스냅샷).
 */
@Entity("user_stats")
export class UserStats {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "text" })
  nickname: string;

  @Column({ name: "games_played", type: "integer", default: 0 })
  gamesPlayed: number;

  /** 1등 횟수. 동점 1등도 센다. */
  @Column({ type: "integer", default: 0 })
  wins: number;

  @Column({ name: "total_score", type: "bigint", default: 0 })
  totalScore: string; // pg 는 bigint 를 문자열로 준다

  @Column({ name: "best_score", type: "integer", default: 0 })
  bestScore: number;

  @Column({ name: "last_played_at", type: "timestamptz" })
  lastPlayedAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
