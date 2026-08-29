"use client";

import { ChatPanel } from "@/features/room/ChatPanel";
import { DrawCanvas } from "@/features/room/DrawCanvas";
import { PlayerList } from "@/features/room/PlayerList";
import { RoundBanner } from "@/features/room/RoundBanner";
import { useRoomSocket } from "@/features/room/useRoomSocket";
import { useNickname } from "@/features/player/nickname";
import { XpWindow } from "@/features/ui/XpWindow";
import { normalizeRoomCode } from "@gachamind/shared";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  // 주소창에 직접 친 코드일 수 있어 서버에 묻기 전에 정규 형태로 맞춘다.
  const roomId = normalizeRoomCode(params.roomId);
  const router = useRouter();
  const { nickname, ready } = useNickname();

  // 초대 링크로 곧장 들어온 사람은 닉네임이 없다. 입구에서 받아 이 방으로 돌려보낸다.
  useEffect(() => {
    if (ready && !nickname) router.replace(`/?next=/room/${roomId}`);
  }, [ready, nickname, roomId, router]);

  const {
    status,
    me,
    players,
    feed,
    game,
    isDrawer,
    drawChannel,
    sendChat,
    sendStartGame,
    sendStroke,
    sendClear,
  } = useRoomSocket(roomId, nickname);

  const statusMeta = {
    connecting: { label: "연결 중", dot: "bg-amber-400" },
    connected: { label: "연결됨", dot: "bg-emerald-500" },
    disconnected: { label: "연결 끊김", dot: "bg-red-500" },
    "not-found": { label: "방을 찾을 수 없음", dot: "bg-red-500" },
    "room-full": { label: "정원 초과", dot: "bg-red-500" },
  }[status];

  if (status === "not-found" || status === "room-full") {
    const isFull = status === "room-full";
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
        <XpWindow title="gachaMind" icon="⚠️" bodyClassName="flex items-start gap-4 p-5">
          <span className="text-4xl" aria-hidden>
            {isFull ? "🚫" : "❓"}
          </span>
          <div>
            <p className="font-bold">{isFull ? "방이 가득 찼습니다" : "방을 찾을 수 없습니다"}</p>
            <p className="mt-1 text-xs text-muted">
              {isFull
                ? `방 ${roomId}의 정원이 가득 찼습니다.`
                : `방 코드 ${roomId}가 존재하지 않거나 이미 종료되었습니다.`}
            </p>
            <button onClick={() => router.push("/lobby")} className="xp-button mt-3">
              로비로 돌아가기
            </button>
          </div>
        </XpWindow>
      </main>
    );
  }

  const chatPlaceholder = isDrawer
    ? "출제자는 정답을 말할 수 없습니다"
    : game.phase === "playing"
      ? "정답을 입력하세요"
      : "메시지를 입력하세요";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <XpWindow
        title={`가챠마인드 - ${nickname}님`}
        icon="🎨"
        bodyClassName="flex flex-col gap-2 p-2"
      >
        {/* 메뉴 막대. 실제 메뉴는 없고 XP 창 분위기를 위한 장식이다 */}
        <div className="flex gap-4 border-b border-[#aca899] px-2 pb-1.5 text-xs" aria-hidden>
          <span>파일(F)</span>
          <span>편집(E)</span>
          <span>보기(V)</span>
          <span>도움말(H)</span>
        </div>

        <RoundBanner
          game={game}
          isDrawer={isDrawer}
          playerCount={players.length}
          onStart={sendStartGame}
        />

        <div className="grid gap-2 lg:grid-cols-[1fr_17rem]">
          <DrawCanvas
            channel={drawChannel}
            canDraw={isDrawer && game.phase === "playing"}
            onStroke={sendStroke}
            onClear={sendClear}
          />

          <div className="flex min-h-0 flex-col gap-2">
            <PlayerList
              players={players}
              meId={me?.id ?? null}
              drawerId={game.drawerId}
              solvedIds={game.solvedIds}
            />
            <ChatPanel feed={feed} placeholder={chatPlaceholder} onSend={sendChat} />
          </div>
        </div>

        {/* XP 상태 표시줄 */}
        <div className="flex gap-1 text-xs">
          <span className="xp-panel flex flex-1 items-center gap-1.5 px-2 py-1">
            <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
          <span className="xp-panel px-2 py-1">참가자 {players.length}명</span>
          <span className="xp-panel max-w-56 truncate px-2 py-1" title={roomId}>
            방 {roomId}
          </span>
          <button onClick={() => router.push("/lobby")} className="xp-button py-0.5">
            로비로
          </button>
        </div>
      </XpWindow>
    </main>
  );
}
