"use client";

import type { ClientToServerMessage, ServerToClientMessage } from "@gachamind/shared";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const nickname = searchParams.get("nick") ?? "익명";

  const [playerCount, setPlayerCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const res = await fetch(`/api/rooms/${roomId}`);
      const { port } = await res.json();
      if (cancelled) return;

      const socket = new WebSocket(`ws://${window.location.hostname}:${port}`);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus("connected");
        const join: ClientToServerMessage = { type: "join", roomId, nickname };
        socket.send(JSON.stringify(join));
      };

      socket.onmessage = (event) => {
        const message: ServerToClientMessage = JSON.parse(event.data);
        setPlayerCount(message.playerCount);
        if (message.type === "player-joined") {
          setLog((prev) => [...prev, `${message.nickname} 입장`]);
        } else if (message.type === "player-left") {
          setLog((prev) => [...prev, "플레이어 퇴장"]);
        }
      };

      socket.onclose = () => setStatus("disconnected");
    }

    connect();

    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [roomId, nickname]);

  return (
    <main style={{ maxWidth: 480, margin: "40px auto" }}>
      <h1>방 {roomId}</h1>
      <p>상태: {status}</p>
      <p>인원: {playerCount}명</p>
      <ul>
        {log.map((entry, i) => (
          <li key={i}>{entry}</li>
        ))}
      </ul>
    </main>
  );
}
