import { clearSessionCookie } from "@/features/auth/server";
import { NextResponse } from "next/server";

/** 로그아웃. 서버에 세션 저장소가 없으므로(JWT) 쿠키만 지우면 끝이다. */
export function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
