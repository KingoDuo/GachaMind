"use client";

import type { PlayerSummary } from "@gachamind/shared";

interface Props {
  players: PlayerSummary[];
  meId: string | null;
  drawerId: string | null;
  solvedIds: string[];
}

export function PlayerList({ players, meId, drawerId, solvedIds }: Props) {
  const ranked = [...players].sort((a, b) => b.score - a.score);

  return (
    <section className="flex flex-col">
      <h2 className="px-1 pb-1 text-xs font-bold">참가자 ({players.length})</h2>
      <ul className="xp-sunken flex max-h-48 flex-col overflow-y-auto text-xs">
        {ranked.map((player, index) => {
          const isMe = player.id === meId;
          return (
            <li
              key={player.id}
              className={`flex items-center justify-between gap-2 px-2 py-1 ${
                isMe ? "bg-[#316ac5] text-white" : index % 2 === 1 ? "bg-[#f4f3ee]" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-1">
                {player.id === drawerId && (
                  <span className="shrink-0" aria-hidden>
                    ✏️
                  </span>
                )}
                <span className="truncate">{player.nickname}</span>
                {isMe && <span className="shrink-0 opacity-80">(나)</span>}
                {solvedIds.includes(player.id) && (
                  <span className={`shrink-0 ${isMe ? "text-white" : "text-[#217821]"}`}>
                    정답
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums font-bold">{player.score}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
