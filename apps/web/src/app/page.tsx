"use client";

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
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">gachaMind</h1>
        <p className="mt-1 text-sm text-muted">가챠마인드 by KingoDuo</p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <input
          placeholder="닉네임"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
        />
        <button
          onClick={handleCreateRoom}
          disabled={isCreating || !nickname.trim()}
          className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCreating ? "만드는 중..." : "방 만들기"}
        </button>
        <button
          onClick={handleQuickMatch}
          disabled={isMatching || !nickname.trim()}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isMatching ? "매칭 중..." : "⚡ 빠른 시작"}
        </button>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />
          또는
          <span className="h-px flex-1 bg-border" />
        </div>

        <input
          placeholder="방 코드"
          value={joinRoomId}
          onChange={(e) => setJoinRoomId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
        />
        <button
          onClick={handleJoinRoom}
          disabled={!nickname.trim() || !joinRoomId.trim()}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          방 입장
        </button>
      </div>
    </main>
  );
}
