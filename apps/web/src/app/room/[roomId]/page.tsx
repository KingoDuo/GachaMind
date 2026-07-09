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
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "not-found" | "room-full"
  >("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (res.status === 404) {
        if (!cancelled) setStatus("not-found");
        return;
      }
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
        if (message.type === "room-full") {
          setStatus("room-full");
          return;
        }
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

  const statusMeta = {
    connecting: { label: "연결 중", dot: "bg-amber-400" },
    connected: { label: "연결됨", dot: "bg-emerald-500" },
    disconnected: { label: "연결 끊김", dot: "bg-red-500" },
    "not-found": { label: "방을 찾을 수 없음", dot: "bg-red-500" },
    "room-full": { label: "정원 초과", dot: "bg-red-500" },
  }[status];

  if (status === "not-found") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight">방을 찾을 수 없습니다</h1>
        <p className="text-sm text-muted">
          방 코드 {roomId}가 존재하지 않거나 이미 종료되었습니다.
        </p>
      </main>
    );
  }

  if (status === "room-full") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight">방이 가득 찼습니다</h1>
        <p className="text-sm text-muted">방 {roomId}의 정원이 가득 찼습니다.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">방 {roomId}</h1>
          <p className="text-sm text-muted">{nickname}(으)로 접속</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
          <span className="rounded-full bg-surface px-3 py-1 font-medium">
            👥 {playerCount}명
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          활동 로그
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {log.length === 0 ? (
            <li className="px-2 py-1 text-muted">아직 활동이 없습니다.</li>
          ) : (
            log.map((entry, i) => (
              <li key={i} className="rounded px-2 py-1 odd:bg-background">
                {entry}
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
