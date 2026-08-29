"use client";

import { RoomList } from "@/features/lobby/RoomList";
import { useNickname } from "@/features/player/nickname";
import { XpWindow } from "@/features/ui/XpWindow";
import {
  ROOM_CODE_LENGTH,
  isRoomCode,
  normalizeRoomCode,
  type RoomListResponse,
  type RoomSummary,
} from "@gachamind/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function LobbyPage() {
  const router = useRouter();
  const { nickname, ready } = useNickname();

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<"create" | "match" | null>(null);

  // 닉네임 없이 주소로 바로 들어온 경우. 입구에서 받아 다시 여기로 돌아온다.
  useEffect(() => {
    if (ready && !nickname) router.replace("/");
  }, [ready, nickname, router]);

  /** 목록은 서버가 주는 스냅샷이다. 최초 1회 + 새로고침 버튼으로만 다시 받는다. */
  const loadRooms = useCallback(async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/rooms", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data: RoomListResponse = await res.json();
      setRooms(data.rooms);
    } catch {
      setListError("방 목록을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  function enterRoom(roomId: string) {
    router.push(`/room/${roomId}`);
  }

  // 배정 가능한 game-session이 하나도 없으면 matchmaking이 503을 준다.
  async function assignAndEnter(mode: "create" | "match") {
    setActionError(null);
    setPending(mode);
    try {
      const res = await fetch(mode === "create" ? "/api/rooms" : "/api/rooms/match", {
        method: "POST",
      });
      if (!res.ok) {
        setActionError("지금은 들어갈 수 있는 게임 서버가 없습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      const { roomId } = await res.json();
      enterRoom(roomId);
    } finally {
      setPending(null);
    }
  }

  function handleJoinByCode() {
    if (!isRoomCode(joinCode)) {
      setActionError(`방 코드는 ${ROOM_CODE_LENGTH}자리입니다.`);
      return;
    }
    setActionError(null);
    enterRoom(joinCode);
  }

  // sessionStorage는 마운트 후에야 읽을 수 있다. 그 사이에는 창 틀만 그려 화면이 비지 않게 한다.
  if (!ready || !nickname) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-10">
        <XpWindow title="가챠마인드 - 로비" icon="🚪" bodyClassName="p-8">
          <p className="text-center text-xs text-muted">로비를 여는 중...</p>
        </XpWindow>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-10">
      <XpWindow title="가챠마인드 - 로비" icon="🚪" bodyClassName="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3 border-b border-[#aca899] pb-3">
          <span className="text-3xl" aria-hidden>
            🖌️
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold">로비</h1>
            <p className="truncate text-xs text-muted">{nickname}님, 어서 오세요</p>
          </div>
          <button onClick={() => router.push("/")} className="xp-button ml-auto shrink-0">
            닉네임 변경
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold">참여 가능한 방</span>
          <span className="text-xs text-muted">{rooms.length}개</span>
          <button onClick={loadRooms} disabled={isLoading} className="xp-button ml-auto">
            {isLoading ? "불러오는 중..." : "새로고침"}
          </button>
        </div>

        <RoomList
          rooms={rooms}
          isLoading={isLoading}
          error={listError}
          onJoin={(room) => enterRoom(room.roomId)}
        />

        <div className="flex gap-2">
          <button
            onClick={() => assignAndEnter("create")}
            disabled={pending !== null}
            className="xp-button xp-button-default flex-1"
          >
            {pending === "create" ? "만드는 중..." : "방 만들기"}
          </button>
          <button
            onClick={() => assignAndEnter("match")}
            disabled={pending !== null}
            className="xp-button flex-1"
          >
            {pending === "match" ? "매칭 중..." : "빠른 시작"}
          </button>
        </div>

        {actionError && (
          <p className="border border-[#aca899] bg-[#ffffe1] px-2 py-1 text-xs text-red-700">
            {actionError}
          </p>
        )}

        <div className="my-1 flex items-center gap-3 text-xs text-muted">
          <span className="h-0.5 flex-1 border-t border-b border-t-[#aca899] border-b-white" />
          또는 코드로 입장
          <span className="h-0.5 flex-1 border-t border-b border-t-[#aca899] border-b-white" />
        </div>

        <div className="flex gap-2">
          <input
            id="room-code"
            placeholder={`${ROOM_CODE_LENGTH}자리 코드`}
            value={joinCode}
            // 입력 즉시 정규 형태로 바꿔 보여준다. 화면에 보이는 값이 곧 실제 코드가 된다.
            onChange={(e) =>
              setJoinCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH))
            }
            onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="xp-input min-w-0 flex-1 font-mono tracking-widest"
          />
          <button onClick={handleJoinByCode} disabled={!isRoomCode(joinCode)} className="xp-button">
            입장
          </button>
        </div>
      </XpWindow>
    </main>
  );
}
