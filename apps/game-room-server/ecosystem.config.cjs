// 방 배정 라우팅이 "포트 단위"로 이뤄지므로, PM2 cluster 모드(같은 포트 공유) 대신
// 인스턴스마다 다른 포트를 쓰는 fork 앱을 여러 개 등록한다.
// 포트 목록은 web(apps/web/src/lib/room-registry.ts)과 공유하는 루트의
// game-room-ports.json에서 읽으므로 여기서 따로 값을 맞출 필요가 없다.
const { ports: PORTS } = require("../../game-room-ports.json");

module.exports = {
  apps: PORTS.map((port) => ({
    name: `game-room-${port}`,
    script: "dist/index.js",
    cwd: __dirname,
    env: { PORT: String(port) },
  })),
};
