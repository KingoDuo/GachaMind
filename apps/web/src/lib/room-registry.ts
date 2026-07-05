// web을 단일 인스턴스로 가정한 in-memory 라우팅 테이블.
// web이 멀티 인스턴스가 되면 이 Map을 Redis(room_id -> port)로 교체해야 한다.
//
// 알려진 한계: game-room-server가 방 전원 퇴장 시 자신의 내부 Map에서 room을 지우더라도
// 이 registry에는 알려주지 않는다. 그래서 portLoad는 "이 포트에 배정된 방 수"의 근사치이며
// 실시간 정확한 연결 수는 아니다 (뼈대 단계 한계, 다음 단계에서 개선 대상).

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

export function listAssignments(): { roomId: string; port: number }[] {
  return Array.from(roomToPort.entries()).map(([roomId, port]) => ({ roomId, port }));
}
