import type { IncomingMessage } from "node:http";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME, type SessionTokenPayload } from "@gachamind/shared";

/**
 * user 서비스와 같은 값이어야 한다. user 가 서명한 토큰을 여기서 로컬 검증하는 것이 "신원 브릿지"다.
 * Redis 세션 조회 없이 join 핫패스에서 I/O 가 생기지 않는다.
 */
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");

/** 로그인한 접속자의 신원. 게스트는 null. */
export interface Identity {
  userId: string;
  username: string;
  nickname: string;
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * WS 핸드셰이크 요청의 세션 쿠키로 "누구"인지 알아낸다.
 * 쿠키는 httpOnly 라 브라우저 JS 는 못 읽지만, 같은 도메인의 WS 요청에는 자동으로 실린다.
 * 쿠키가 없거나 토큰이 깨졌거나 만료됐으면 게스트(null)로 본다. 접속 자체를 막지는 않는다.
 */
export async function identifyConnection(req: IncomingMessage): Promise<Identity | null> {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify<SessionTokenPayload>(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.nickname !== "string") return null;
    return { userId: payload.sub, username: payload.username, nickname: payload.nickname };
  } catch {
    return null;
  }
}
