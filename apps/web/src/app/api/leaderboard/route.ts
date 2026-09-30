import { findLeaderboard } from "@/features/leaderboard/server";
import { failureResponse } from "@/features/profile/server";

/** 상위 순위 → user 서비스 위임. ?sort=totalScore|wins|bestScore */
export async function GET(request: Request) {
  const sort = new URL(request.url).searchParams.get("sort");
  const leaderboard = await findLeaderboard(sort);
  if (!leaderboard.ok) return failureResponse(leaderboard.reason);
  return Response.json(leaderboard.data);
}
