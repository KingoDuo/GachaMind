"use client";

import type { AuthUser } from "@gachamind/shared";
import { useEffect, useState } from "react";

/** BFF 오류 응답을 화면 메시지로 쓰기 위한 예외. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function postCredentials(path: string, body: Record<string, string>): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError("네트워크 오류로 요청하지 못했습니다.", 0);
  }

  const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; message?: string };
  if (!res.ok || !data.user) {
    throw new AuthError(data.message ?? "요청을 처리하지 못했습니다.", res.status);
  }
  return data.user;
}

export function signup(username: string, password: string, nickname: string): Promise<AuthUser> {
  return postCredentials("/api/auth/signup", { username, password, nickname });
}

export function login(username: string, password: string): Promise<AuthUser> {
  return postCredentials("/api/auth/login", { username, password });
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

/** 로그인돼 있으면 계정, 아니면 null. 서버 오류도 "모름"이 아니라 null 로 본다(게스트 흐름으로). */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: AuthUser };
    return data.user ?? null;
  } catch {
    return null;
  }
}

/**
 * 현재 세션. 쿠키는 httpOnly 라 JS 가 직접 못 읽고, 마운트 후 BFF 에 물어봐야 안다.
 * 그래서 첫 렌더는 항상 `ready: false` 다.
 */
export function useSession(): { user: AuthUser | null; ready: boolean } {
  const [state, setState] = useState<{ user: AuthUser | null; ready: boolean }>({
    user: null,
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((user) => {
      if (!cancelled) setState({ user, ready: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
