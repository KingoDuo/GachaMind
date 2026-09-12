import type { PlayerStats } from "@gachamind/shared";

/** 날짜만. 프로필의 가입일·마지막 플레이처럼 시각까지는 필요 없는 자리. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
    new Date(iso),
  );
}

/** 누적 전적 6칸. 값이 0 이면 그냥 0 을 보여준다(빈 상태 문구는 목록 쪽이 맡는다). */
export function StatsPanel({ stats }: { stats: PlayerStats }) {
  const winRate = stats.gamesPlayed === 0 ? 0 : Math.round((stats.wins / stats.gamesPlayed) * 100);
  const avgScore = stats.gamesPlayed === 0 ? 0 : Math.round(stats.totalScore / stats.gamesPlayed);

  const cells: { label: string; value: string }[] = [
    { label: "게임 수", value: `${stats.gamesPlayed}판` },
    { label: "1등", value: `${stats.wins}회` },
    { label: "1등 비율", value: `${winRate}%` },
    { label: "평균 점수", value: `${avgScore}점` },
    { label: "최고 점수", value: `${stats.bestScore}점` },
    { label: "마지막 플레이", value: stats.lastPlayedAt ? formatDate(stats.lastPlayedAt) : "-" },
  ];

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cells.map((cell) => (
        <div key={cell.label} className="xp-panel px-3 py-2">
          <dt className="text-xs text-muted">{cell.label}</dt>
          <dd className="text-base font-bold tabular-nums">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
