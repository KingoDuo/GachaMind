"use client";

import { useRoomSocket } from "@/features/room/useRoomSocket";
import { useParams, useSearchParams } from "next/navigation";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const nickname = searchParams.get("nick") ?? "익명";

  const { status, playerCount, log } = useRoomSocket(roomId, nickname);

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
