import { Type } from "class-transformer";
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * Postgres uuid 컬럼이 받는 모양 그대로. class-validator 의 IsUUID 는 버전 자리(RFC 4122)까지 검사해서
 * game-session 이 아닌 곳(테스트·백필)에서 만든 id 를 튕길 수 있어 쓰지 않는다.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// packages/shared 의 GameFinishedEvent / GameResultPlayer 와 같은 모양. results-worker 가 큐에서 받은 그대로 넘긴다.

export class GameResultPlayerDto {
  @Matches(UUID_PATTERN)
  playerId: string;

  /** 로그인한 플레이어면 users.id, 게스트면 null. */
  @IsOptional()
  @Matches(UUID_PATTERN)
  userId: string | null;

  @IsString()
  nickname: string;

  @IsInt()
  score: number;

  @IsInt()
  @Min(1)
  rank: number;
}

export class GameFinishedDto {
  @Equals("game-finished")
  type: "game-finished";

  @Matches(UUID_PATTERN)
  gameId: string;

  @IsString()
  roomId: string;

  @IsDateString()
  finishedAt: string;

  @IsInt()
  @Min(0)
  roundsPlayed: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GameResultPlayerDto)
  players: GameResultPlayerDto[];
}
