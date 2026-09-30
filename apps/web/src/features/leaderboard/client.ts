"use client";

import type { LeaderboardRankResponse, LeaderboardResponse, LeaderboardSort } from "@gachamind/shared";
import { getJson } from "@/features/profile/client";

export function fetchLeaderboard(sort: LeaderboardSort): Promise<LeaderboardResponse> {
  return getJson(`/api/leaderboard?sort=${sort}`);
}

export function fetchRank(username: string, sort: LeaderboardSort): Promise<LeaderboardRankResponse> {
  return getJson(`/api/leaderboard/${encodeURIComponent(username)}?sort=${sort}`);
}
