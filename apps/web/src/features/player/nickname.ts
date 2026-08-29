"use client";

import { useEffect, useState } from "react";

/**
 * 닉네임은 이 탭에서만 쓰는 값이라 sessionStorage에 둔다.
 * 쿼리스트링(`?nick=`)으로 나르면 방 링크를 복사해 줄 때 남의 닉네임이 따라가고,
 * localStorage에 두면 한 브라우저에서 두 명이 테스트할 수 없다.
 */
const NICKNAME_KEY = "gachamind:nickname";

export const MAX_NICKNAME_LENGTH = 20;

export function storeNickname(nickname: string): void {
  sessionStorage.setItem(NICKNAME_KEY, nickname);
}

/**
 * 저장된 닉네임을 읽는다.
 * 서버 렌더에는 sessionStorage가 없으므로 첫 렌더는 항상 `ready: false`이고,
 * 마운트 후에야 값이 정해진다. 이 구분이 없으면 닉네임이 있는데도 입구로 튕겨낸다.
 */
export function useNickname(): { nickname: string | null; ready: boolean } {
  const [state, setState] = useState<{ nickname: string | null; ready: boolean }>({
    nickname: null,
    ready: false,
  });

  useEffect(() => {
    setState({ nickname: sessionStorage.getItem(NICKNAME_KEY), ready: true });
  }, []);

  return state;
}
