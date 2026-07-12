import { GAME_EVENTS_QUEUE } from "@gachamind/shared";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://localhost:5672";

// TODO: amqplib로 RABBITMQ_URL 연결 → '${GAME_EVENTS_QUEUE}' 큐 소비
//       → game-finished 이벤트를 받아 user DB(전적/통계)에 영속화.
console.log(
  `[results-worker] started. will consume '${GAME_EVENTS_QUEUE}' from ${RABBITMQ_URL} (TODO: wire amqplib)`,
);

// 소비 루프를 붙이기 전까지 프로세스를 살려둔다.
setInterval(() => {}, 1 << 30);
