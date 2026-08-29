"use client";

import { MAX_NICKNAME_LENGTH, storeNickname } from "@/features/player/nickname";
import { XpWindow } from "@/features/ui/XpWindow";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 입력 후 돌아갈 곳. 방 링크로 왔다가 닉네임이 없어 여기로 튕긴 경우 그 방으로 돌려보낸다.
 * useSearchParams를 쓰면 이 페이지가 통째로 서버 렌더에서 빠져 첫 화면이 비므로,
 * 버튼을 누른 시점에 주소창에서 직접 읽는다. 외부 주소로 나가지 않게 앱 내부 경로만 허용한다.
 */
function nextPath(): string {
  const requested = new URLSearchParams(window.location.search).get("next") ?? "";
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/lobby";
}

export default function Home() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");

  function handleStart() {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    storeNickname(trimmed);
    router.push(nextPath());
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <XpWindow title="gachaMind" icon="🎨" bodyClassName="flex flex-col gap-3 p-4">
        <div className="mb-1 flex items-center gap-3 border-b border-[#aca899] pb-3">
          <span className="text-3xl" aria-hidden>
            🖌️
          </span>
          <div>
            <h1 className="text-lg font-bold">가챠마인드</h1>
            <p className="text-xs text-muted">by KingoDuo</p>
          </div>
        </div>

        <label className="text-xs font-bold" htmlFor="nickname">
          닉네임
        </label>
        <input
          id="nickname"
          placeholder="닉네임을 입력하세요"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStart()}
          maxLength={MAX_NICKNAME_LENGTH}
          autoFocus
          className="xp-input w-full"
        />

        <button
          onClick={handleStart}
          disabled={!nickname.trim()}
          className="xp-button xp-button-default mt-1"
        >
          게임 시작
        </button>

        <p className="text-xs text-muted">
          가입 없이 바로 플레이할 수 있습니다. 닉네임은 이 탭에서만 유지됩니다.
        </p>
      </XpWindow>
    </main>
  );
}
