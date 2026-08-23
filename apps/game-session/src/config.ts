/** 이 프로세스가 여는 WS 포트. Redis projection에 기록해 matchmaking이 접속 주소를 알 수 있게 한다. */
export const PORT = Number(process.env.PORT ?? 4001);
