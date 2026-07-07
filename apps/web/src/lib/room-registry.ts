// web을 단일 인스턴스로 가정한 in-memory 라우팅 테이블.
// web이 멀티 인스턴스가 되면 이 Map을 Redis(room_id -> port)로 교체해야 한다.
//
// game-room-server는 방이 비면 DELETE /api/rooms/[roomId]로 releaseRoom을 호출해
// 이 registry에도 알려준다. 다만 그 콜백이 실패/지연되는 경우(네트워크 오류, web 재시작 등)에는
// portLoad가 실제 연결 수와 어긋날 수 있다 — 여전히 근사치임을 감안할 것.

const GAME_ROOM_PORTS: number[] = (process.env.GAME_ROOM_PORTS ?? "4001,4002,4003,4004")
  .split(",")
  .map((port) => Number(port.trim()));

const roomToPort = new Map<string, number>();
const portLoad = new Map<number, number>(GAME_ROOM_PORTS.map((port) => [port, 0]));

function pickLeastLoadedPort(): number {
  let bestPort = GAME_ROOM_PORTS[0];
  let bestLoad = Infinity;
  for (const port of GAME_ROOM_PORTS) {
    const load = portLoad.get(port) ?? 0;
    if (load < bestLoad) {
      bestLoad = load;
      bestPort = port;
    }
  }
  return bestPort;
}

/** 이미 배정된 방이면 기존 포트를 반환하고, 없으면 least-connections로 새로 배정한다. */
export function assignRoom(roomId: string): number {
  const existing = roomToPort.get(roomId);
  if (existing !== undefined) return existing;

  const port = pickLeastLoadedPort();
  roomToPort.set(roomId, port);
  portLoad.set(port, (portLoad.get(port) ?? 0) + 1);
  console.log(`[room-registry] assigned room=${roomId} -> port=${port}`);
  return port;
}

export function getRoomPort(roomId: string): number | undefined {
  return roomToPort.get(roomId);
}

/** game-room-server가 방이 비어서 정리했을 때 호출하는 콜백이 부르는 함수. */
export function releaseRoom(roomId: string): void {
  const port = roomToPort.get(roomId);
  if (port === undefined) return;
  roomToPort.delete(roomId);
  portLoad.set(port, Math.max(0, (portLoad.get(port) ?? 0) - 1));
  console.log(`[room-registry] released room=${roomId} (was on port=${port})`);
}

export function listAssignments(): { roomId: string; port: number }[] {
  return Array.from(roomToPort.entries()).map(([roomId, port]) => ({ roomId, port }));
}
