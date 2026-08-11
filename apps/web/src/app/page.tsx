"use client";

import { XpWindow } from "@/features/ui/XpWindow";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isMatching, setIsMatching] = useState(false);

  async function handleCreateRoom() {
    if (!nickname.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const { roomId } = await res.json();
      router.push(`/room/${roomId}?nick=${encodeURIComponent(nickname)}`);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleQuickMatch() {
    //닉네임 검증
    if (!nickname.trim()) return;
    setIsMatching(true);
    try {
      const res = await fetch("/api/rooms/match", { method: "POST" });
      const { roomId } = await res.json();
      router.push(`/room/${roomId}?nick=${encodeURIComponent(nickname)}`);
    } finally {
      setIsMatching(false);
    }
  }

  function handleJoinRoom() {
    if (!nickname.trim() || !joinRoomId.trim()) return;
    router.push(`/room/${joinRoomId.trim()}?nick=${encodeURIComponent(nickname)}`);
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
          대화명
        </label>
        <input
          id="nickname"
          placeholder="닉네임을 입력하세요"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="xp-input w-full"
        />

        <div className="mt-1 flex gap-2">
          <button
            onClick={handleCreateRoom}
            disabled={isCreating || !nickname.trim()}
            className="xp-button xp-button-default flex-1"
          >
            {isCreating ? "만드는 중..." : "방 만들기"}
          </button>
          <button
            onClick={handleQuickMatch}
            disabled={isMatching || !nickname.trim()}
            className="xp-button flex-1"
          >
            {isMatching ? "매칭 중..." : "빠른 시작"}
          </button>
        </div>

        <div className="my-1 flex items-center gap-3 text-xs text-muted">
          <span className="h-0.5 flex-1 border-t border-b border-t-[#aca899] border-b-white" />
          또는
          <span className="h-0.5 flex-1 border-t border-b border-t-[#aca899] border-b-white" />
        </div>

        <label className="text-xs font-bold" htmlFor="room-code">
          방 코드
        </label>
        <div className="flex gap-2">
          <input
            id="room-code"
            placeholder="초대받은 방 코드"
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value)}
            className="xp-input min-w-0 flex-1"
          />
          <button
            onClick={handleJoinRoom}
            disabled={!nickname.trim() || !joinRoomId.trim()}
            className="xp-button"
          >
            입장
          </button>
        </div>
      </XpWindow>
    </main>
  );
}
