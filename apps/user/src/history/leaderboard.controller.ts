import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { LeaderboardService } from "./leaderboard.service";
import {
  DEFAULT_LEADERBOARD_SORT,
  LEADERBOARD_SORTS,
  type LeaderboardRankResponse,
  type LeaderboardResponse,
  type LeaderboardSort,
} from "./types";

/** 리더보드 조회. 프로필과 같이 내부 전용(web 이 부른다)이라 인증이 없다. */
@Controller("leaderboard")
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  async top(@Query("sort") sortRaw?: string, @Query("limit") limitRaw?: string): Promise<LeaderboardResponse> {
    const sort = parseSort(sortRaw);
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    if (limit !== undefined && !Number.isInteger(limit)) throw new BadRequestException("invalid limit");
    return { sort, entries: await this.leaderboard.top(sort, limit) };
  }

  @Get(":username")
  async rankOf(
    @Param("username") username: string,
    @Query("sort") sortRaw?: string,
  ): Promise<LeaderboardRankResponse> {
    const sort = parseSort(sortRaw);
    const entry = await this.leaderboard.rankOf(username, sort);
    if (entry === undefined) throw new NotFoundException("없는 계정입니다.");
    return { sort, entry };
  }
}

function parseSort(raw: string | undefined): LeaderboardSort {
  if (raw === undefined) return DEFAULT_LEADERBOARD_SORT;
  if (!(LEADERBOARD_SORTS as readonly string[]).includes(raw)) throw new BadRequestException("invalid sort");
  return raw as LeaderboardSort;
}
