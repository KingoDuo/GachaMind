import { failureResponse, findGames } from "@/features/profile/server";

/** 최근 게임 목록 → user 서비스 위임. ?cursor= 로 다음 페이지. */
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const cursor = new URL(request.url).searchParams.get("cursor");
  const games = await findGames(username, cursor);
  if (!games.ok) return failureResponse(games.reason);
  return Response.json(games.data);
}
