"use client";

import type { LeaderboardEntry, LeaderboardSort } from "@gachamind/shared";

interface Props {
  entries: LeaderboardEntry[];
  sort: LeaderboardSort;
  isLoading: boolean;
  error: string | null;
  /** 로그인한 회원의 순위. 목록 안에 있으면 그 줄을, 밖이면 맨 아래 고정 줄로 보여준다. */
  me: LeaderboardEntry | null;
  onSelect: (entry: LeaderboardEntry) => void;
}

/** 좁은 화면에서는 지금 정렬 기준 열만 남긴다. */
const COLUMNS: { key: LeaderboardSort | "gamesPlayed"; label: string; width: string }[] = [
  { key: "totalScore", label: "누적 점수", width: "w-20" },
  { key: "wins", label: "1등", width: "w-14" },
  { key: "bestScore", label: "최고 점수", width: "w-20" },
  { key: "gamesPlayed", label: "게임 수", width: "w-16" },
];

const RANK_CLASS: Record<number, string> = {
  1: "text-amber-600 font-bold",
  2: "text-slate-500 font-bold",
  3: "text-orange-800 font-bold",
};

function Row({
  entry,
  sort,
  highlight,
  onSelect,
}: {
  entry: LeaderboardEntry;
  sort: LeaderboardSort;
  highlight: boolean;
  onSelect: (entry: LeaderboardEntry) => void;
}) {
  return (
    <li>
      <button
        onClick={() => onSelect(entry)}
        className={`flex w-full items-center gap-px py-1 text-left text-xs hover:bg-[#316ac5] hover:text-white ${
          highlight ? "bg-[#ffffe1]" : ""
        }`}
      >
        <span className={`w-14 px-2 text-right tabular-nums ${RANK_CLASS[entry.rank] ?? ""}`}>{entry.rank}</span>
        <span className="min-w-0 flex-1 truncate px-2">
          {entry.nickname} <span className="opacity-60">@{entry.username}</span>
        </span>
        {COLUMNS.map((col) => (
          <span
            key={col.key}
            className={`${col.width} px-2 text-right tabular-nums ${col.key === sort ? "font-bold" : "hidden sm:block"}`}
          >
            {entry[col.key]}
          </span>
        ))}
      </button>
    </li>
  );
}

/** XP 탐색기 '자세히' 보기 모양의 순위표. 머리글·내 순위 줄을 스크롤 영역 안에 sticky 로 둬 스크롤바가 생겨도 열이 맞는다. */
export function LeaderboardTable({ entries, sort, isLoading, error, me, onSelect }: Props) {
  const meInList = me !== null && entries.some((entry) => entry.username === me.username);

  return (
    <div className="xp-sunken h-96 overflow-y-auto">
      <div className="sticky top-0 flex gap-px border-b border-[#aca899] bg-[#ece9d8] text-xs font-bold">
        <span className="w-14 px-2 py-1 text-right">순위</span>
        <span className="flex-1 px-2 py-1">플레이어</span>
        {COLUMNS.map((col) => (
          <span key={col.key} className={`${col.width} px-2 py-1 text-right ${col.key === sort ? "" : "hidden sm:block"}`}>
            {col.label}
          </span>
        ))}
      </div>

      {error ? (
        <p className="p-4 text-center text-xs text-red-700">{error}</p>
      ) : isLoading ? (
        <p className="p-4 text-center text-xs text-muted">순위를 불러오는 중...</p>
      ) : entries.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted">
          아직 순위에 오른 회원이 없습니다. 로그인하고 게임을 끝까지 마치면 순위에 오릅니다.
        </p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <Row
              key={entry.username}
              entry={entry}
              sort={sort}
              highlight={entry.username === me?.username}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}

      {me && !meInList && !isLoading && !error && (
        <ul className="sticky bottom-0 border-t border-[#aca899] bg-white">
          <Row entry={me} sort={sort} highlight onSelect={onSelect} />
        </ul>
      )}
    </div>
  );
}
