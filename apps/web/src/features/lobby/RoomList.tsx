"use client";

import type { RoomSummary } from "@gachamind/shared";

interface Props {
  rooms: RoomSummary[];
  isLoading: boolean;
  error: string | null;
  onJoin: (room: RoomSummary) => void;
}

const PHASE_LABEL = {
  waiting: { text: "대기 중", className: "text-emerald-700" },
  playing: { text: "게임 중", className: "text-blue-700" },
  ended: { text: "결과 확인 중", className: "text-muted" },
} as const;

/** XP 탐색기의 '자세히' 보기를 흉내낸 방 목록. */
export function RoomList({ rooms, isLoading, error, onJoin }: Props) {
  return (
    <div className="xp-sunken flex h-72 flex-col">
      {/* 열 머리글. 목록이 스크롤돼도 남아 있어야 해서 스크롤 영역 밖에 둔다 */}
      <div className="flex shrink-0 gap-px border-b border-[#aca899] bg-[#ece9d8] text-xs font-bold">
        <span className="flex-1 px-2 py-1">방 코드</span>
        <span className="w-20 px-2 py-1 text-right">인원</span>
        <span className="w-24 px-2 py-1">상태</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="p-4 text-center text-xs text-red-700">{error}</p>
        ) : isLoading ? (
          <p className="p-4 text-center text-xs text-muted">방 목록을 불러오는 중...</p>
        ) : rooms.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted">
            열려 있는 방이 없습니다. 방을 만들어 시작해보세요.
          </p>
        ) : (
          <ul>
            {rooms.map((room) => {
              const phase = PHASE_LABEL[room.phase];
              return (
                <li key={room.roomId}>
                  <button
                    onClick={() => onJoin(room)}
                    className="group flex w-full items-center gap-px py-1 text-left hover:bg-[#316ac5] hover:text-white focus:bg-[#316ac5] focus:text-white focus:outline-none"
                  >
                    <span className="flex-1 truncate px-2 font-mono tracking-widest">
                      {room.roomId}
                    </span>
                    <span className="w-20 px-2 text-right tabular-nums">
                      {room.playerCount} / {room.capacity}
                    </span>
                    <span
                      className={`w-24 px-2 text-xs group-hover:text-white group-focus:text-white ${phase.className}`}
                    >
                      {phase.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
