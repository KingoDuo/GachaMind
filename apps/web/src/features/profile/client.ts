"use client";

import type { PlayerGamesResponse, ProfileResponse } from "@gachamind/shared";

/** BFF 오류 응답을 화면 메시지로 쓰기 위한 예외. */
export class ProfileError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new ProfileError("네트워크 오류로 요청하지 못했습니다.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new ProfileError(data.message ?? "요청을 처리하지 못했습니다.", res.status);
  return data;
}

export function fetchProfile(username: string): Promise<ProfileResponse> {
  return getJson(`/api/profiles/${encodeURIComponent(username)}`);
}

export function fetchGames(username: string, cursor: string | null): Promise<PlayerGamesResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return getJson(`/api/profiles/${encodeURIComponent(username)}/games${query}`);
}
