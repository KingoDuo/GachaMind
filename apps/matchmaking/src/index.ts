import Fastify from "fastify";
import type { AssignMode, RoomAssignment } from "@gachamind/shared";

const PORT = Number(process.env.PORT ?? 4000);

const app = Fastify({ logger: false });

app.get("/health", async () => ({ status: "ok", service: "matchmaking" }));

// 방 배정: mode=match면 진행 중인 방에 난입, mode=create면 새 방.
// TODO: Redis(rooms:joinable / room:{id})로 실제 매칭·least-conn 배정 구현.
app.post<{ Body: { mode?: AssignMode } }>("/assign", async (_req, reply) => {
  return reply.code(501).send({ error: "not implemented" });
});

// 방 코드 → 포트 조회. TODO: Redis에서 room:{id}.port 조회, 없으면 404.
app.get<{ Params: { roomId: string } }>("/rooms/:roomId", async (_req, reply) => {
  return reply.code(501).send({ error: "not implemented" });
});

// game-session이 빈 방을 정리했을 때 호출하는 콜백. TODO: Redis 정리.
app.delete<{ Params: { roomId: string } }>("/rooms/:roomId", async (_req, reply) => {
  return reply.code(204).send();
});

// 타입 계약 확인용 참조 (미사용 경고 방지). 실제 로직 채울 때 제거.
export type { RoomAssignment };

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`[matchmaking] listening on ${PORT}`);
