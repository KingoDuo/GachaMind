import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { GAME_EVENTS_QUEUE, type GameEvent } from "@gachamind/shared";

/**
 * game.events 큐의 소비자. 게임 결과를 받아 user 서비스의 내부 API 로 넘긴다.
 * 전적 테이블의 주인은 user 서비스라 여기서 DB 를 직접 만지지 않는다.
 * 이 프로세스가 하는 일은 "큐 → HTTP" 변환과 ack/재시도 판단뿐이다. 큐가 버퍼가 되어
 * user 가 잠깐 죽어 있어도 game-session 은 발행만 하고 끝나고, 결과는 나중에 반영된다.
 */
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://localhost:5672";
const USER_URL = process.env.USER_URL ?? "http://localhost:4010";

/** 브로커가 아직 안 떴을 수 있으니 붙을 때까지 기다린다. */
const CONNECT_RETRY_MS = 3_000;
/** 되돌린 메시지가 곧바로 다시 오는 것을 막는 간격. */
const REQUEUE_DELAY_MS = 2_000;
/** user 서비스 응답 대기 상한. 이보다 오래 걸리면 실패로 보고 되돌린다. */
const DELIVER_TIMEOUT_MS = 10_000;

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let stopping = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectWithRetry(): Promise<ChannelModel> {
  for (;;) {
    try {
      return await connect(RABBITMQ_URL);
    } catch (err) {
      if (stopping) throw err;
      console.error(
        `[results-worker] rabbitmq connect failed, retrying in ${CONNECT_RETRY_MS}ms:`,
        err instanceof Error ? err.message : err,
      );
      await sleep(CONNECT_RETRY_MS);
    }
  }
}

type Delivery =
  | { outcome: "saved" | "duplicate" }
  | { outcome: "rejected"; detail: string } // 4xx: 다시 보내도 똑같이 실패한다
  | { outcome: "unavailable"; detail: string }; // 5xx / 연결 실패 / 타임아웃: 나중에 다시

/** user 서비스에 결과를 넘긴다. 응답 코드를 ack 규칙으로 바꾼다. */
async function deliver(event: GameEvent): Promise<Delivery> {
  let res: Response;
  try {
    res = await fetch(`${USER_URL}/internal/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(DELIVER_TIMEOUT_MS),
    });
  } catch (err) {
    return { outcome: "unavailable", detail: err instanceof Error ? err.message : String(err) };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { saved?: boolean };
    return { outcome: body.saved === false ? "duplicate" : "saved" };
  }
  const detail = `${res.status} ${await res.text().catch(() => "")}`.trim();
  // 404 는 "형식 불량"이 아니라 롤링 배포 중 아직 옛 user(내부 API 없음)가 받은 것이다. 버리면 전적이 사라지니 되돌린다.
  const permanent = res.status >= 400 && res.status < 500 && res.status !== 404;
  return permanent ? { outcome: "rejected", detail } : { outcome: "unavailable", detail };
}

async function handleMessage(target: Channel, msg: ConsumeMessage): Promise<void> {
  let event: GameEvent;

  try {
    event = JSON.parse(msg.content.toString()) as GameEvent;
  } catch (err) {
    // 형식이 깨진 메시지는 몇 번을 다시 시도해도 똑같이 실패한다. 되돌리지 않고 버린다.
    console.error("[results-worker] dropping unparseable message:", err);
    target.ack(msg);
    return;
  }

  if (event.type !== "game-finished") {
    console.warn(`[results-worker] dropping unknown event type: ${(event as GameEvent).type}`);
    target.ack(msg);
    return;
  }

  const result = await deliver(event);
  switch (result.outcome) {
    case "saved":
      target.ack(msg);
      console.log(
        `[results-worker] delivered game ${event.gameId} (room ${event.roomId}, ${event.players.length} players)`,
      );
      return;
    case "duplicate":
      target.ack(msg);
      console.log(`[results-worker] game ${event.gameId} already recorded, skipped`);
      return;
    case "rejected":
      // user 가 형식을 거부했다. 재시도해도 같으니 버리고 로그로 남긴다.
      target.ack(msg);
      console.error(`[results-worker] game ${event.gameId} rejected by user service, dropping: ${result.detail}`);
      return;
    case "unavailable":
      // user 가 잠깐 죽었거나 DB 문제. 큐로 되돌려 붙을 때까지 계속 재시도한다.
      console.error(`[results-worker] game ${event.gameId} not delivered, requeueing: ${result.detail}`);
      await sleep(REQUEUE_DELAY_MS);
      target.nack(msg, false, true);
      return;
  }
}

async function main(): Promise<void> {
  connection = await connectWithRetry();
  channel = await connection.createChannel();
  await channel.assertQueue(GAME_EVENTS_QUEUE, { durable: true });
  // 한 번에 한 건만 받는다. 전달에 실패한 메시지가 다른 메시지를 막지 않도록.
  await channel.prefetch(1);

  const target = channel;
  await target.consume(GAME_EVENTS_QUEUE, (msg) => {
    if (msg) void handleMessage(target, msg);
  });

  console.log(`[results-worker] consuming '${GAME_EVENTS_QUEUE}' from ${RABBITMQ_URL} → ${USER_URL}`);

  connection.on("close", () => {
    if (stopping) return;
    console.error("[results-worker] rabbitmq connection closed, exiting to be restarted");
    process.exit(1);
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  stopping = true;
  console.log(`[results-worker] ${signal}: shutting down`);
  try {
    await channel?.close();
    await connection?.close();
  } catch (err) {
    console.error("[results-worker] shutdown error:", err);
  }
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

main().catch((err) => {
  console.error("[results-worker] fatal:", err);
  process.exit(1);
});
