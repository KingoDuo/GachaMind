// 서버 전용(route handler에서만 import). 리더보드 조회를 user 서비스에 위임한다.
import type { LeaderboardRankResponse, LeaderboardResponse } from "@gachamind/shared";
import { USER_URL } from "@/features/auth/server";
import { fetchInternal, type Lookup } from "@/features/profile/server";

function sortQuery(sort: string | null): string {
  return sort ? `?sort=${encodeURIComponent(sort)}` : "";
}

export function findLeaderboard(sort: string | null): Promise<Lookup<LeaderboardResponse>> {
  return fetchInternal<LeaderboardResponse>(`${USER_URL}/leaderboard${sortQuery(sort)}`);
}

export function findRank(username: string, sort: string | null): Promise<Lookup<LeaderboardRankResponse>> {
  return fetchInternal<LeaderboardRankResponse>(
    `${USER_URL}/leaderboard/${encodeURIComponent(username)}${sortQuery(sort)}`,
  );
}
