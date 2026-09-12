"use client";

import type { PlayerGameRecord } from "@gachamind/shared";

interface Props {
  games: PlayerGameRecord[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
}

/** 날짜 + 시각. 같은 날 여러 판이 있어 시각까지 보여준다. */
function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const RANK_CLASS: Record<number, string> = {
  1: "text-amber-600 font-bold",
  2: "text-slate-500 font-bold",
  3: "text-orange-800 font-bold",
};

/** XP 탐색기 '자세히' 보기 모양의 최근 게임 목록. 로비의 RoomList 와 같은 틀. */
export function GameHistory({ games, isLoading, error, hasMore, onLoadMore }: Props) {
  return (
    <div className="xp-sunken flex h-72 flex-col">
      <div className="flex shrink-0 gap-px border-b border-[#aca899] bg-[#ece9d8] text-xs font-bold">
        <span className="w-28 px-2 py-1">일시</span>
        <span className="flex-1 px-2 py-1">방</span>
        <span className="w-20 px-2 py-1 text-right">등수</span>
        <span className="w-16 px-2 py-1 text-right">점수</span>
        <span className="w-16 px-2 py-1 text-right">라운드</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="p-4 text-center text-xs text-red-700">{error}</p>
        ) : games.length === 0 && isLoading ? (
          <p className="p-4 text-center text-xs text-muted">전적을 불러오는 중...</p>
        ) : games.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted">
            아직 기록된 게임이 없습니다. 게임을 끝까지 마치면 전적이 남습니다.
          </p>
        ) : (
          <ul>
            {games.map((game) => (
              <li key={game.gameId} className="flex items-center gap-px py-1 text-xs">
                <span className="w-28 px-2 tabular-nums text-muted">{formatDateTime(game.finishedAt)}</span>
                <span className="flex-1 truncate px-2 font-mono tracking-widest">{game.roomId}</span>
                <span className={`w-20 px-2 text-right tabular-nums ${RANK_CLASS[game.rank] ?? ""}`}>
                  {game.rank}등 <span className="font-normal text-muted">/ {game.playerCount}명</span>
                </span>
                <span className="w-16 px-2 text-right tabular-nums">{game.score}</span>
                <span className="w-16 px-2 text-right tabular-nums text-muted">{game.roundsPlayed}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasMore && !error && (
        <div className="shrink-0 border-t border-[#aca899] bg-[#ece9d8] p-1 text-center">
          <button onClick={onLoadMore} disabled={isLoading} className="xp-button py-0.5 text-xs">
            {isLoading ? "불러오는 중..." : "더 보기"}
          </button>
        </div>
      )}
    </div>
  );
}
