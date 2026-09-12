/** 이 프로세스가 여는 WS 포트. 컨테이너 안에서만 의미가 있다. */
export const PORT = Number(process.env.PORT ?? 4001);

/**
 * 이 프로세스(샤드)의 이름. Redis projection에 기록해 matchmaking이 어느 샤드에 방이 있는지 알고,
 * 브라우저가 접속 주소(/gs/{shard})를 만드는 데 쓴다.
 * 포트가 아니라 이름인 이유: 인스턴스가 여러 대면 같은 포트가 여러 샤드에 있어 포트로는 샤드를 못 가린다.
 * 로컬(pnpm dev/compose)은 프록시가 없어 브라우저가 포트로 직접 붙어야 하므로, 안 주면 포트를 이름으로 쓴다.
 */
export const SHARD_ID = process.env.SHARD_ID ?? String(PORT);
