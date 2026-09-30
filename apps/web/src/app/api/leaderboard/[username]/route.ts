import { findRank } from "@/features/leaderboard/server";
import { failureResponse } from "@/features/profile/server";

/** 한 회원의 순위 → user 서비스 위임. 프로필처럼 누구의 것이든 볼 수 있다. */
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const sort = new URL(request.url).searchParams.get("sort");
  const rank = await findRank(username, sort);
  if (!rank.ok) return failureResponse(rank.reason);
  return Response.json(rank.data);
}
