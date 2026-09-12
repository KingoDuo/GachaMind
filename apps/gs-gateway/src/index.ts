// game-session 게이트웨이. 브라우저의 WebSocket 을 "방이 있는 그 샤드"로 이어 주는 무상태 TCP 중계기.
//
// 왜 필요한가: 샤드는 방을 메모리에 들고 있어 아무 샤드로나 보내면 안 되는데, ALB 는 타깃그룹 안의 특정 타깃을
// 고르는 기능이 없다. 그래서 ALB 는 /gs/* 를 통째로 여기(무상태, 여러 개 띄워도 됨)로 보내고,
// 여기서 경로의 샤드 이름을 Redis 의 session:{shard} 로 실제 주소(인스턴스 IP, 동적 포트)로 바꿔 연결을 잇는다.
// 샤드가 늘고 줄어도(오토스케일링) 이 프로세스는 아무것도 몰라도 된다 — 표는 Redis 에 있고 샤드가 스스로 쓴다.
//
// 중계는 HTTP Upgrade 요청을 그대로 다시 써 보낸 뒤 양쪽 소켓을 파이프로 잇는 것뿐이다.
// 쿠키 등 헤더가 그대로 넘어가므로 game-session 의 세션 쿠키 신원 확인도 그대로 동작한다.
// Upgrade 이후의 프레임은 들여다보지 않는다(순수 바이트 중계).

import { createServer, type IncomingMessage } from "node:http";
import { connect, type Socket } from "node:net";
import { Redis } from "ioredis";
import { sessionLoadKey } from "@gachamind/shared";

const PORT = Number(process.env.PORT ?? 4100);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/** 샤드에 TCP 연결이 붙기까지 기다리는 시간. 죽은 주소(사본이 아직 안 만료된)에 오래 매달리지 않게 한다. */
const UPSTREAM_CONNECT_TIMEOUT_MS = 3_000;

const redis = new Redis(REDIS_URL);
redis.on("error", (err: Error) => console.error("[gs-gateway] redis error:", err));

/** /gs/{shard} 또는 /gs/{shard}/... 에서 샤드 이름을 꺼낸다. */
function shardFromUrl(url: string | undefined): string | null {
  const match = /^\/gs\/([A-Za-z0-9_-]+)(?:[/?]|$)/.exec(url ?? "");
  return match ? match[1] : null;
}

function reject(socket: Socket, status: number, reason: string): void {
  if (socket.writable) socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  else socket.destroy();
}

/** 받은 Upgrade 요청을 원문 그대로 다시 직렬화한다. 헤더 순서와 대소문자를 보존한다. */
function serializeRequest(req: IncomingMessage): string {
  const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
  for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
  return `${lines.join("\r\n")}\r\n\r\n`;
}

async function handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): Promise<void> {
  const shard = shardFromUrl(req.url);
  if (!shard) return reject(socket, 404, "Not Found");

  let host: string | undefined;
  let port: number | undefined;
  try {
    const load = await redis.hmget(sessionLoadKey(shard), "host", "port");
    host = load[0] ?? undefined;
    port = load[1] ? Number(load[1]) : undefined;
  } catch (err) {
    console.error(`[gs-gateway] lookup failed for shard ${shard}:`, err);
    return reject(socket, 503, "Service Unavailable");
  }
  // 사본이 없으면 그 샤드는 내려간 것이다. 브라우저는 방을 다시 조회해 재배정을 받아야 한다.
  if (!host || !port) return reject(socket, 404, "Not Found");
  if (!socket.writable) return;

  const upstream = connect({ host, port });
  upstream.setNoDelay(true);
  socket.setNoDelay(true);
  upstream.setTimeout(UPSTREAM_CONNECT_TIMEOUT_MS, () => upstream.destroy(new Error("connect timeout")));

  upstream.once("connect", () => {
    upstream.setTimeout(0);
    upstream.write(serializeRequest(req));
    if (head.length > 0) upstream.write(head);
    // 이후는 양방향 바이트 중계. 한쪽이 닫히면 다른 쪽도 닫는다.
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", (err) => {
    console.error(`[gs-gateway] upstream ${host}:${port} (shard ${shard}) failed:`, err.message);
    reject(socket, 502, "Bad Gateway");
  });
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "gs-gateway" }));
    return;
  }
  // Upgrade 가 아닌 일반 HTTP 요청은 받을 것이 없다.
  res.writeHead(404);
  res.end();
});

server.on("upgrade", (req, socket, head) => {
  void handleUpgrade(req, socket as Socket, head);
});

server.listen(PORT, () => console.log(`[gs-gateway] listening on ${PORT}`));

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`[gs-gateway] ${signal}`);
  server.close();
  await redis.quit();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
