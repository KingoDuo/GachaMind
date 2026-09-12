import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

/**
 * 게임 한 판. id 는 game-session 이 발행한 이벤트의 gameId 그대로라(생성이 아니라 기록) PrimaryColumn 이다.
 * 컬럼은 이 테이블을 처음 만든 results-worker 시절의 snake_case 를 그대로 따른다(데이터가 이미 있다).
 */
@Entity("games")
export class Game {
  @PrimaryColumn("uuid")
  id: string;

  @Column({ name: "room_id", type: "text" })
  roomId: string;

  @Column({ name: "rounds_played", type: "integer" })
  roundsPlayed: number;

  @Column({ name: "finished_at", type: "timestamptz" })
  finishedAt: Date;

  /** 종료 시점에 방에 있던 인원(= game_players 행 수). "몇 명 중 몇 등"을 매번 세지 않으려고 저장한다. */
  @Column({ name: "player_count", type: "integer" })
  playerCount: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
