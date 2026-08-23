import { connect, type Channel, type ChannelModel } from "amqplib";
import { GAME_EVENTS_QUEUE, type GameEvent } from "@gachamind/shared";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://localhost:5672";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
/** 동시에 여러 게임이 끝나도 연결은 하나만 만든다. */
let connecting: Promise<Channel | null> | null = null;

async function openChannel(): Promise<Channel | null> {
  try {
    connection = await connect(RABBITMQ_URL);
    // 브로커가 재시작해도 큐가 남아야 게임 결과가 유실되지 않는다.
    const opened = await connection.createChannel();
    await opened.assertQueue(GAME_EVENTS_QUEUE, { durable: true });

    // 연결이 끊기면 다음 발행 때 새로 만든다.
    connection.on("close", () => {
      connection = null;
      channel = null;
    });
    connection.on("error", (err: Error) => {
      console.error("[events] rabbitmq connection error:", err.message);
    });

    channel = opened;
    console.log(`[events] connected to ${RABBITMQ_URL}`);
    return opened;
  } catch (err) {
    connection = null;
    channel = null;
    console.error("[events] rabbitmq connect failed:", err);
    return null;
  } finally {
    connecting = null;
  }
}

async function getChannel(): Promise<Channel | null> {
  if (channel) return channel;
  if (!connecting) connecting = openChannel();
  return connecting;
}

/**
 * 게임 이벤트를 발행한다.
 * 게임 진행과 무관한 사후 처리라, 브로커가 죽어 있어도 게임을 막지 않고 로그만 남긴다.
 * 다만 그렇게 놓친 결과는 복구되지 않는다.
 */
export async function publishGameEvent(event: GameEvent): Promise<void> {
  const target = await getChannel();
  if (!target) {
    console.error(`[events] dropped ${event.type} for room ${event.roomId}: no channel`);
    return;
  }

  try {
    // persistent: 브로커가 재시작해도 메시지가 살아남는다.
    target.sendToQueue(GAME_EVENTS_QUEUE, Buffer.from(JSON.stringify(event)), {
      persistent: true,
      contentType: "application/json",
    });
  } catch (err) {
    console.error(`[events] publish failed for room ${event.roomId}:`, err);
  }
}

export async function closeEventPublisher(): Promise<void> {
  try {
    await channel?.close();
    await connection?.close();
  } catch (err) {
    console.error("[events] close failed:", err);
  }
}
