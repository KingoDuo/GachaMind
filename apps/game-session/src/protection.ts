// ECS 태스크 scale-in 보호.
//
// 오토스케일링이 desired_count 를 줄이거나 배포가 옛 태스크를 내릴 때, 방을 들고 있는 태스크가 골라지면 게임이 끊긴다.
// ECS 는 이를 위해 태스크가 스스로 "지금 나를 죽이지 마라"고 표시하는 API 를 준다(에이전트 로컬 엔드포인트).
// 보호된 태스크는 서비스 스케일인·배포에서 제외되고, ECS 는 보호 안 된(빈) 태스크부터 내린다.
// 전부 보호 중이면 비워질 때까지 기다린다 — 그래서 matchmaking 이 새 방을 "가장 찬 샤드"에 몰아 넣어(binpack)
// 빈 샤드가 생기게 하는 것과 짝이다.
//
// 보호는 만료 시간이 있어 프로세스가 죽어도 영영 남지 않는다. 방이 있는 동안 주기적으로 갱신한다.
// ECS 밖(로컬)에서는 ECS_AGENT_URI 가 없어 아무것도 하지 않는다.

const ECS_AGENT_URI = process.env.ECS_AGENT_URI;

/** 보호 만료(분). 갱신을 놓쳐도 이 시간 뒤엔 풀린다. */
const PROTECTION_EXPIRES_MINUTES = 60;
/** 이보다 오래된 보호는 하트비트에서 다시 건다. 만료의 절반. */
const PROTECTION_REFRESH_MS = (PROTECTION_EXPIRES_MINUTES / 2) * 60_000;

let protectedSince: number | null = null;

async function updateTaskProtection(enabled: boolean): Promise<void> {
  const res = await fetch(`${ECS_AGENT_URI}/task-protection/v1/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      enabled ? { ProtectionEnabled: true, ExpiresInMinutes: PROTECTION_EXPIRES_MINUTES } : { ProtectionEnabled: false },
    ),
  });
  if (!res.ok) throw new Error(`task protection returned ${res.status}: ${await res.text()}`);
}

/**
 * 방 유무에 맞춰 보호를 맞춘다. 방이 생기면 걸고, 방이 없어지면 풀고, 방이 있는 동안은 주기적으로 갱신한다.
 * 실패해도 게임 진행은 막지 않는다 — 보호가 안 걸리면 스케일인에 끊길 수 있을 뿐이다.
 */
export async function syncTaskProtection(roomCount: number): Promise<void> {
  if (!ECS_AGENT_URI) return;

  const wantProtected = roomCount > 0;
  const now = Date.now();
  const stale = protectedSince !== null && now - protectedSince > PROTECTION_REFRESH_MS;

  if (wantProtected && (protectedSince === null || stale)) {
    try {
      await updateTaskProtection(true);
      protectedSince = now;
      console.log(`[protection] enabled (${roomCount} room(s))`);
    } catch (err) {
      console.error("[protection] enable failed:", err);
    }
  } else if (!wantProtected && protectedSince !== null) {
    try {
      await updateTaskProtection(false);
      protectedSince = null;
      console.log("[protection] disabled (no rooms)");
    } catch (err) {
      console.error("[protection] disable failed:", err);
    }
  }
}
