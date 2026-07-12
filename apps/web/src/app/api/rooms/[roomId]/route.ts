const MATCHMAKING_URL = process.env.MATCHMAKING_URL ?? "http://localhost:4000";

/** 방 코드 → 접속할 game-session 포트 조회 (matchmaking 위임). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const res = await fetch(`${MATCHMAKING_URL}/rooms/${roomId}`);
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
