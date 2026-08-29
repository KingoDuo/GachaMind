// BFF 프록시: 브라우저는 web만 호출하고, web이 서버측에서 matchmaking을 부른다.
const MATCHMAKING_URL = process.env.MATCHMAKING_URL ?? "http://localhost:4000";

/** 로비 방 목록 → matchmaking 위임. 목록은 매 순간 달라지므로 캐시하지 않는다. */
export async function GET() {
  const res = await fetch(`${MATCHMAKING_URL}/rooms`, { cache: "no-store" });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

/** 방 만들기 → matchmaking에 새 방 배정 요청. */
export async function POST() {
  const res = await fetch(`${MATCHMAKING_URL}/assign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "create" }),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
