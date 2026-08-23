const MATCHMAKING_URL = process.env.MATCHMAKING_URL ?? "http://localhost:4000";

/**
 * 방이 사라졌음을 matchmaking에 알린다.
 * Redis 매칭 인덱스의 주인은 matchmaking이므로 키 삭제는 이쪽에서 직접 하지 않는다.
 * 이 호출이 실패해도 projection TTL이 만료시켜 주므로 재시도하지 않는다.
 */
export async function notifyRoomClosed(roomId: string): Promise<void> {
  try {
    const res = await fetch(`${MATCHMAKING_URL}/rooms/${roomId}`, { method: "DELETE" });
    if (!res.ok) {
      console.error(`[matchmaking] close callback for ${roomId} returned ${res.status}`);
    }
  } catch (err) {
    console.error(`[matchmaking] close callback for ${roomId} failed:`, err);
  }
}
