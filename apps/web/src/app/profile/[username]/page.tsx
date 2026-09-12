"use client";

import { useSession } from "@/features/auth/client";
import { fetchGames, fetchProfile, ProfileError } from "@/features/profile/client";
import { GameHistory } from "@/features/profile/GameHistory";
import { formatDate, StatsPanel } from "@/features/profile/StatsPanel";
import { XpWindow } from "@/features/ui/XpWindow";
import type { PlayerGameRecord, ProfileResponse } from "@gachamind/shared";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * 프로필 화면. 아이디(username)로 누구든 볼 수 있다.
 * 프로필과 게임 목록은 다른 서비스에서 오므로(계정 ↔ 전적) 따로 받고 따로 실패한다.
 */
export default function ProfilePage() {
  const router = useRouter();
  const { username: rawUsername } = useParams<{ username: string }>();
  const username = decodeURIComponent(rawUsername);
  const session = useSession();
  const isMe = session.user?.username === username;

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [profileError, setProfileError] = useState<{ message: string; status: number } | null>(null);

  const [games, setGames] = useState<PlayerGameRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfile(username)
      .then((data) => !cancelled && setProfile(data))
      .catch((err: unknown) => {
        if (cancelled) return;
        setProfileError(
          err instanceof ProfileError
            ? { message: err.message, status: err.status }
            : { message: "프로필을 불러오지 못했습니다.", status: 0 },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  /** 첫 페이지와 "더 보기"가 같은 함수를 쓴다. cursor 가 null 이면 첫 페이지. */
  const loadGames = useCallback(
    async (cursor: string | null) => {
      setGamesLoading(true);
      setGamesError(null);
      try {
        const page = await fetchGames(username, cursor);
        setGames((prev) => (cursor ? [...prev, ...page.games] : page.games));
        setNextCursor(page.nextCursor);
      } catch (err) {
        setGamesError(err instanceof ProfileError ? err.message : "전적을 불러오지 못했습니다.");
      } finally {
        setGamesLoading(false);
      }
    },
    [username],
  );

  useEffect(() => {
    void loadGames(null);
  }, [loadGames]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-10">
      <XpWindow title="가챠마인드 - 프로필" icon="👤" bodyClassName="flex flex-col gap-3 p-4">
        {profileError ? (
          <div className="flex flex-col gap-3 py-6 text-center">
            <p className="text-sm">
              {profileError.status === 404 ? `'${username}' 계정을 찾을 수 없습니다.` : profileError.message}
            </p>
            <button onClick={() => router.push("/lobby")} className="xp-button mx-auto">
              로비로
            </button>
          </div>
        ) : !profile ? (
          <p className="py-6 text-center text-xs text-muted">프로필을 불러오는 중...</p>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-[#aca899] pb-3">
              <span className="text-3xl" aria-hidden>
                🎨
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold">
                  {profile.user.nickname}
                  {isMe && <span className="ml-2 text-xs font-normal text-muted">내 프로필</span>}
                </h1>
                <p className="truncate text-xs text-muted">
                  @{profile.user.username} · {formatDate(profile.user.createdAt)} 가입
                </p>
              </div>
              <button onClick={() => router.push("/lobby")} className="xp-button ml-auto shrink-0">
                로비로
              </button>
            </div>

            <StatsPanel stats={profile.stats} />

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold">최근 게임</span>
              <span className="text-xs text-muted">종료 시점에 방에 있던 판만 기록됩니다</span>
            </div>
            <GameHistory
              games={games}
              isLoading={gamesLoading}
              error={gamesError}
              hasMore={nextCursor !== null}
              onLoadMore={() => void loadGames(nextCursor)}
            />
          </>
        )}
      </XpWindow>
    </main>
  );
}
