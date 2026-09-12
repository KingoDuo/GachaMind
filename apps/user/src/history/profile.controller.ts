import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { UserService } from "../user/user.service";
import { HistoryService } from "./history.service";
import type { PlayerGamesResponse, PlayerStats } from "./types";

/** 다른 사람에게도 보이는 계정 정보. packages/shared 의 PublicUser 와 같은 모양. */
export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  createdAt: string;
}

/** packages/shared 의 ProfileResponse 와 같은 모양. */
export interface ProfileResponse {
  user: PublicUser;
  stats: PlayerStats;
}

/**
 * 프로필 조회. 내부 전용(web 이 부른다)이라 인증이 없고, 누구의 것을 보여줄지는 web 이 정한다.
 * 계정과 전적이 같은 서비스 소유라 한 번에 합쳐 준다.
 */
@Controller("users")
export class ProfileController {
  constructor(
    private readonly users: UserService,
    private readonly history: HistoryService,
  ) {}

  @Get(":username/profile")
  async profile(@Param("username") username: string): Promise<ProfileResponse> {
    const user = await this.findUser(username);
    return {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        createdAt: user.createdAt.toISOString(),
      },
      stats: await this.history.getStats(user.id),
    };
  }

  @Get(":username/games")
  async games(
    @Param("username") username: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limitRaw?: string,
  ): Promise<PlayerGamesResponse> {
    const user = await this.findUser(username);
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    if (limit !== undefined && !Number.isInteger(limit)) throw new BadRequestException("invalid limit");
    const page = await this.history.listGames(user.id, { limit, cursor: cursor ?? null });
    if (!page) throw new BadRequestException("invalid cursor");
    return page;
  }

  private async findUser(username: string) {
    const user = await this.users.findByUsername(username);
    if (!user) throw new NotFoundException("없는 계정입니다.");
    return user;
  }
}
