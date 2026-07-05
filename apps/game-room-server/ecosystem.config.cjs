// 방 배정 라우팅이 "포트 단위"로 이뤄지므로, PM2 cluster 모드(같은 포트 공유) 대신
// 인스턴스마다 다른 포트를 쓰는 fork 앱을 여러 개 등록한다.
// web(apps/web)의 GAME_ROOM_PORTS 목록과 반드시 일치해야 한다.
const PORTS = [4001, 4002, 4003, 4004];

module.exports = {
  apps: PORTS.map((port) => ({
    name: `game-room-${port}`,
    script: "dist/index.js",
    cwd: __dirname,
    env: { PORT: String(port) },
  })),
};
