"use client";

import { MAX_NICKNAME_LENGTH } from "@gachamind/shared";
import { useSyncExternalStore } from "react";

/**
 * 닉네임은 이 탭에서만 쓰는 값이라 sessionStorage에 둔다.
 * 쿼리스트링(`?nick=`)으로 나르면 방 링크를 복사해 줄 때 남의 닉네임이 따라가고,
 * localStorage에 두면 한 브라우저에서 두 명이 테스트할 수 없다.
 *
 * 로그인한 사람도 같은 자리를 쓴다(로그인 시 계정 닉네임을 여기 넣는다). 그래서 로비·방 화면은
 * 게스트인지 회원인지 구분할 필요가 없다. "누구"인지는 세션 쿠키가 따로 나른다.
 */
const NICKNAME_KEY = "gachamind:nickname";

export { MAX_NICKNAME_LENGTH };

export function storeNickname(nickname: string): void {
  sessionStorage.setItem(NICKNAME_KEY, nickname);
}

export function clearNickname(): void {
  sessionStorage.removeItem(NICKNAME_KEY);
}

// sessionStorage는 같은 탭 안에서 바뀌어도 이벤트가 없다. 값을 바꾼 뒤엔 항상 페이지를 옮기므로 구독은 비워둔다.
const subscribe = () => () => {};
const readClient = () => sessionStorage.getItem(NICKNAME_KEY);
/** 서버 렌더·하이드레이션 중에는 "아직 모름". null(없음)과 구분하려고 undefined를 쓴다. */
const readServer = () => undefined;

/**
 * 저장된 닉네임을 읽는다.
 * 서버 렌더에는 sessionStorage가 없으므로 첫 렌더는 항상 `ready: false`이고,
 * 하이드레이션 뒤에야 값이 정해진다. 이 구분이 없으면 닉네임이 있는데도 입구로 튕겨낸다.
 */
export function useNickname(): { nickname: string | null; ready: boolean } {
  const value = useSyncExternalStore(subscribe, readClient, readServer);
  return value === undefined ? { nickname: null, ready: false } : { nickname: value, ready: true };
}
