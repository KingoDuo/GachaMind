"use client";

import { MIN_PLAYERS_TO_START, ROUND_DURATION_MS } from "@gachamind/shared";
import { useEffect, useState } from "react";
import type { GameState } from "./useRoomSocket";

interface Props {
  game: GameState;
  isDrawer: boolean;
  playerCount: number;
  onStart: () => void;
}

/**
 * 남은 시간 표시. 라운드가 진행 중일 때만 마운트되므로 타이머도 그때만 돈다.
 * 부모를 리렌더하지 않으려고 별도 컴포넌트로 분리했다.
 */
function RoundTimer({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const remaining = Math.max(0, endsAt - now);
  const ratio = Math.min(remaining / ROUND_DURATION_MS, 1);

  return (
    <div className="flex items-center gap-2">
      <div className="xp-progress w-32">
        <div className="xp-progress-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="w-9 shrink-0 tabular-nums text-xs font-bold">
        {Math.ceil(remaining / 1000)}초
      </span>
    </div>
  );
}

export function RoundBanner({ game, isDrawer, playerCount, onStart }: Props) {
  const canStart = playerCount >= MIN_PLAYERS_TO_START;
  const isIdle = game.phase === "waiting" || game.phase === "ended";

  if (isIdle) {
    return (
      <section className="xp-panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            {game.phase === "ended" ? "🏁" : "⏳"}
          </span>
          <div>
            <p className="text-sm font-bold">
              {game.phase === "ended" ? "게임이 끝났습니다" : "게임 대기 중"}
            </p>
            <p className="text-xs text-muted">
              {canStart
                ? "준비되면 게임을 시작하세요."
                : `${MIN_PLAYERS_TO_START}명 이상 모여야 시작할 수 있습니다.`}
            </p>
          </div>
        </div>
        <button onClick={onStart} disabled={!canStart} className="xp-button xp-button-default">
          {game.phase === "ended" ? "다시 시작" : "게임 시작"}
        </button>
      </section>
    );
  }

  // 라운드 사이 쉬는 시간에는 공개된 제시어를 보여준다.
  if (game.revealedWord) {
    return (
      <section className="xp-panel p-3 text-center">
        <p className="text-xs text-muted">{game.round}라운드 종료</p>
        <p className="text-lg font-bold">정답은 &ldquo;{game.revealedWord}&rdquo;</p>
      </section>
    );
  }

  const hint = game.wordLength ? Array(game.wordLength).fill("_").join(" ") : "";

  return (
    <section className="xp-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3">
      <span className="text-xs font-bold">
        라운드 {game.round} / {game.totalRounds}
      </span>

      {isDrawer ? (
        <span className="text-sm">
          내가 출제자 · 제시어 <span className="rounded-xs bg-[#ffffcc] px-2 py-0.5 font-bold">{game.word}</span>
        </span>
      ) : (
        <span className="text-lg font-bold tracking-[0.3em]">{hint}</span>
      )}

      {!isDrawer && (
        <span className="text-xs text-muted">
          <span className="font-bold">{game.drawerNickname}</span>님이 그리는 중
        </span>
      )}

      {game.roundEndsAt && <RoundTimer endsAt={game.roundEndsAt} />}
    </section>
  );
}
