"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

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

  function handleJoinRoom() {
    if (!nickname.trim() || !joinRoomId.trim()) return;
    router.push(`/room/${joinRoomId.trim()}?nick=${encodeURIComponent(nickname)}`);
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>gachaMind</h1>
      <input
        placeholder="닉네임"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
      />
      <button onClick={handleCreateRoom} disabled={isCreating}>
        방 만들기
      </button>
      <hr />
      <input
        placeholder="방 코드"
        value={joinRoomId}
        onChange={(e) => setJoinRoomId(e.target.value)}
      />
      <button onClick={handleJoinRoom}>방 입장</button>
    </main>
  );
}
