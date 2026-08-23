import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { GAME_EVENTS_QUEUE, type GameEvent } from "@gachamind/shared";
import { closeDb, ensureSchema, saveGameResult } from "./db.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://localhost:5672";

/** 브로커가 아직 안 떴을 수 있으니 붙을 때까지 기다린다. */
const CONNECT_RETRY_MS = 3_000;
/** DB 오류로 되돌린 메시지가 곧바로 다시 오는 것을 막는 간격. */
const REQUEUE_DELAY_MS = 2_000;

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

  try {
    const saved = await saveGameResult(event);
    target.ack(msg);
    console.log(
      saved
        ? `[results-worker] saved game ${event.gameId} (room ${event.roomId}, ${event.players.length} players)`
        : `[results-worker] game ${event.gameId} already saved, skipped`,
    );
  } catch (err) {
    // DB 문제는 일시적일 수 있으니 큐로 되돌린다. 붙을 때까지 계속 재시도된다.
    console.error(`[results-worker] save failed for game ${event.gameId}, requeueing:`, err);
    await sleep(REQUEUE_DELAY_MS);
    target.nack(msg, false, true);
  }
}

async function main(): Promise<void> {
  await ensureSchema();

  connection = await connectWithRetry();
  channel = await connection.createChannel();
  await channel.assertQueue(GAME_EVENTS_QUEUE, { durable: true });
  // 한 번에 한 건만 받는다. 저장에 실패한 메시지가 다른 메시지를 막지 않도록.
  await channel.prefetch(1);

  const target = channel;
  await target.consume(GAME_EVENTS_QUEUE, (msg) => {
    if (msg) void handleMessage(target, msg);
  });

  console.log(`[results-worker] consuming '${GAME_EVENTS_QUEUE}' from ${RABBITMQ_URL}`);

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
    await closeDb();
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
