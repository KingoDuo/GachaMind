// 서버 전용(route handler에서만 import). 세션 쿠키 ↔ user 서비스 토큰 변환.
//
// 브라우저는 토큰을 절대 손에 쥐지 않는다. web이 user 서비스에서 받은 JWT를 httpOnly 쿠키에 넣어두고,
// 브라우저가 web을 부를 때 그 쿠키를 다시 Bearer 토큰으로 바꿔 user 서비스에 전달한다.
// user 서비스 자체는 외부에 노출되지 않는다(내부 서비스).
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, type AuthResponse } from "@gachamind/shared";
import { NextResponse, type NextRequest } from "next/server";

export const USER_URL = process.env.USER_URL ?? "http://localhost:4010";

/** 요청의 세션 쿠키 값(JWT). 없으면 null. */
export function readSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/** 프로덕션은 ALB 뒤라 request.url 이 http 로 보인다. 프록시 헤더까지 봐야 secure 쿠키를 제대로 건다. */
function isSecureRequest(request: NextRequest): boolean {
  return (
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:"
  );
}

export function setSessionCookie(response: NextResponse, request: NextRequest, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({ name: SESSION_COOKIE_NAME, value: "", path: "/", maxAge: 0 });
}

/** Nest 의 오류 응답(message 가 문자열 또는 배열)을 한 줄 메시지로 편다. */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message[0] ?? "요청을 처리하지 못했습니다.";
    if (typeof body.message === "string") return body.message;
  } catch {
    // JSON 이 아니면 아래 기본 메시지
  }
  return "요청을 처리하지 못했습니다.";
}

/**
 * 가입/로그인 공통. user 서비스에 그대로 넘기고, 성공하면 토큰은 쿠키로 심고 user 만 브라우저에 돌려준다.
 * user 서비스에 못 붙으면 503.
 */
export async function proxyCredentials(
  request: NextRequest,
  path: "/auth/signup" | "/auth/login",
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${USER_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { message: "지금은 로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." },
      { status: 503 },
    );
  }

  if (!res.ok) {
    return NextResponse.json({ message: await readErrorMessage(res) }, { status: res.status });
  }

  const { accessToken, user } = (await res.json()) as AuthResponse;
  const response = NextResponse.json({ user });
  setSessionCookie(response, request, accessToken);
  return response;
}
