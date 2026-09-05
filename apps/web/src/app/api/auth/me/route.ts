import { clearSessionCookie, readSessionToken, USER_URL } from "@/features/auth/server";
import { NextResponse, type NextRequest } from "next/server";

/** 세션 쿠키로 내 계정 조회. 쿠키가 없거나 토큰이 죽었으면 401(죽은 쿠키는 같이 지운다). */
export async function GET(request: NextRequest) {
  const token = readSessionToken(request);
  if (!token) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });

  let res: Response;
  try {
    res = await fetch(`${USER_URL}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "로그인 서버에 연결할 수 없습니다." }, { status: 503 });
  }

  if (res.status === 401) {
    const response = NextResponse.json({ message: "세션이 만료되었습니다." }, { status: 401 });
    clearSessionCookie(response);
    return response;
  }
  if (!res.ok) {
    return NextResponse.json({ message: "요청을 처리하지 못했습니다." }, { status: res.status });
  }

  return NextResponse.json({ user: await res.json() });
}
