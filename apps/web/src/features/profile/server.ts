// 서버 전용(route handler에서만 import). 프로필 조회를 user 서비스에 위임한다.
// 계정과 전적이 모두 user 서비스 소유라 web 은 합치지 않고 그대로 통과시킨다.
import type { PlayerGamesResponse, ProfileResponse } from "@gachamind/shared";
import { USER_URL } from "@/features/auth/server";

/** 내부 서비스 호출 결과. 못 붙었으면 "unavailable", 없으면 "not-found". */
export type Lookup<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unavailable" | "not-found" | "bad-request" };

async function fetchInternal<T>(url: string): Promise<Lookup<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (res.status === 404) return { ok: false, reason: "not-found" };
  if (res.status === 400) return { ok: false, reason: "bad-request" };
  if (!res.ok) return { ok: false, reason: "unavailable" };
  return { ok: true, data: (await res.json()) as T };
}

/** 계정 + 누적 전적. */
export function findProfile(username: string): Promise<Lookup<ProfileResponse>> {
  return fetchInternal<ProfileResponse>(`${USER_URL}/users/${encodeURIComponent(username)}/profile`);
}

/** 최근 게임 한 페이지. */
export function findGames(username: string, cursor: string | null): Promise<Lookup<PlayerGamesResponse>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchInternal<PlayerGamesResponse>(
    `${USER_URL}/users/${encodeURIComponent(username)}/games${query}`,
  );
}

/** 실패 사유 → 브라우저에 줄 상태/메시지. */
export function failureResponse(reason: Exclude<Lookup<never>, { ok: true }>["reason"]): Response {
  const body =
    reason === "not-found"
      ? { status: 404, message: "없는 계정입니다." }
      : reason === "bad-request"
        ? { status: 400, message: "잘못된 요청입니다." }
        : { status: 503, message: "지금은 로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." };
  return Response.json({ message: body.message }, { status: body.status });
}
