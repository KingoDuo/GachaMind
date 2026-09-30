"use client";

import { useSession } from "@/features/auth/client";
import { fetchLeaderboard, fetchRank } from "@/features/leaderboard/client";
import { LeaderboardTable } from "@/features/leaderboard/LeaderboardTable";
import { ProfileError } from "@/features/profile/client";
import { XpWindow } from "@/features/ui/XpWindow";
import {
  DEFAULT_LEADERBOARD_SORT,
  LEADERBOARD_LIMIT,
  type LeaderboardEntry,
  type LeaderboardSort,
} from "@gachamind/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TABS: { sort: LeaderboardSort; label: string }[] = [
  { sort: "totalScore", label: "누적 점수" },
  { sort: "wins", label: "1등 횟수" },
  { sort: "bestScore", label: "한 판 최고점" },
];

/** 회원 순위(전체 기간). 누구나 볼 수 있고, 로그인했으면 내 순위를 함께 보여준다. */
export default function LeaderboardPage() {
  const router = useRouter();
  const session = useSession();
  const myUsername = session.user?.username ?? null;

  const [sort, setSort] = useState<LeaderboardSort>(DEFAULT_LEADERBOARD_SORT);
  // 새로고침 버튼. 목록은 로비처럼 진입 1회 + 새로고침으로만 다시 받는다.
  const [reloadKey, setReloadKey] = useState(0);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchLeaderboard(sort)
      .then((data) => !cancelled && setEntries(data.entries))
      .catch((err: unknown) => {
        if (cancelled) return;
        setEntries([]);
        setError(err instanceof ProfileError ? err.message : "순위를 불러오지 못했습니다.");
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sort, reloadKey]);

  useEffect(() => {
    setMe(null);
    if (!myUsername) return;
    let cancelled = false;
    fetchRank(myUsername, sort)
      .then((data) => !cancelled && setMe(data.entry))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [myUsername, sort, reloadKey]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-10">
      <XpWindow title="가챠마인드 - 랭킹" icon="🏆" bodyClassName="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3 border-b border-[#aca899] pb-3">
          <span className="text-3xl" aria-hidden>
            🏆
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold">랭킹</h1>
            <p className="truncate text-xs text-muted">
              회원 상위 {LEADERBOARD_LIMIT}명 · 전체 기간
              {session.ready && !session.user && " · 로그인하면 내 순위도 볼 수 있습니다"}
            </p>
          </div>
          <button onClick={() => router.push("/lobby")} className="xp-button ml-auto shrink-0">
            로비로
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.sort}
              onClick={() => setSort(tab.sort)}
              aria-pressed={tab.sort === sort}
              className={`xp-button ${tab.sort === sort ? "xp-button-default font-bold" : ""}`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={isLoading}
            className="xp-button ml-auto"
          >
            {isLoading ? "불러오는 중..." : "새로고침"}
          </button>
        </div>

        <LeaderboardTable
          entries={entries}
          sort={sort}
          isLoading={isLoading}
          error={error}
          me={me}
          onSelect={(entry) => router.push(`/profile/${encodeURIComponent(entry.username)}`)}
        />
      </XpWindow>
    </main>
  );
}
