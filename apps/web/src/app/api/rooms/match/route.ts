const MATCHMAKING_URL = process.env.MATCHMAKING_URL ?? "http://localhost:4000";

/** 빠른 매칭 → matchmaking에 진행 중인 방 난입(없으면 새 방) 요청. */
export async function POST() {
  const res = await fetch(`${MATCHMAKING_URL}/assign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "match" }),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
