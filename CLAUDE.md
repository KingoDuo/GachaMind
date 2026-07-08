# gachaMind

## 개요
[skribbl.io](https://skribbl.io/)를 모티프로 한 웹 캐치마인드(그림 맞추기) 서비스. 플레이어가 자유롭게 방을 만들고 참여할 수 있으며, 한 방(세션)에 최대 100명까지 수용하는 것이 핵심 요구사항이다. 로그인/영구 DB 없이 전부 휘발성 데이터로 운영한다.

이 프로젝트의 목적은 서비스 출시 후 안정적인 운영도 중요하지만, **서버 아키텍처 설계 경험(멀티프로세스, 라우팅, 실시간 동기화)을 쌓는 것** 또한 주요 목적이다. 그래서 트래픽이 검증되지 않은 초기 단계에도 필요한 설계 패턴(예: 게임룸 서버 멀티프로세스화)을 의도적으로 먼저 적용하는 방향으로 결정을 내린다.

## 아키텍처

### 프로세스 구성
| 구분 | 역할 | 기술 |
|---|---|---|
| **web** | 로비 화면 + 인게임 화면(캔버스/채팅) 렌더링, 방 생성/입장 API. 우선 **단일 인스턴스**로 가정. | Next.js (App Router, TypeScript) |
| **game-room-server** | 방 상태/그림 동기화/채팅/정답 판정을 담당하는 authority 서버. 프레임워크 없이 순수 처리량 우선. **멀티프로세스**(PM2 cluster, 코어당 1프로세스)로 시작하며, 프로세스 하나가 여러 방을 인메모리 `Map`으로 동시에 보유. | Node/Bun + TypeScript + `ws` |

### 역할 분리 기준
- Next.js(web) 쪽은 전부 **무상태(stateless)** 작업(페이지 렌더링, 방 배정을 위한 짧은 조회/기록)이라 하나로 묶여 있어도 자연스럽다.
- game-room-server만 **유상태(stateful)** — 연결을 오래 붙들고 메모리에 게임 상태를 쌓는 작업이라 분리되어 있다.
- 방 하나 = 게임룸 서버 프로세스 하나가 아니라, **프로세스 하나가 여러 방을 인메모리로 동시에 처리**하는 모델(Colyseus, Socket.IO room, Figma/Google Docs류 협업 서버와 동일 패턴). 캐치마인드는 물리 연산이 없는 가벼운 페이로드(좌표, 텍스트)라 이 모델이 적합.

### 방 배정(라우팅)
- web이 방 생성/입장 요청을 받으면 `room_id → game-room-server 포트` 매핑과 포트별 연결 수를 관리하고, **least-connections**로 가장 한가한 game-room-server 인스턴스에 방을 배정한다.
- 클라이언트는 web을 거치지 않고 배정된 포트의 game-room-server에 **WebSocket으로 직접 연결**한다.
- 이 매핑은 web 프로세스 내 **in-memory Map**으로 관리한다(Redis 없음). web을 재시작하면 매핑이 초기화되고, web을 멀티 인스턴스로 늘리면 인스턴스마다 다른 매핑을 보게 되는 한계가 있다.
- least-connections에 쓰는 portLoad 카운터는 "이 포트에 배정된 방 수"의 근사치다 — game-room-server가 방을 비웠을 때 web에 알려주는 콜백이 없어서 실시간 연결 수와는 다를 수 있다.

### Redis
- 확정된 용도: **방 매칭** — 유저는 방을 직접 골라 들어가는 게 아니라 "진행 중인 방에 랜덤 난입"이 기본 옵션이 될 예정이다. 이걸 위해선 game-room-server가 여러 프로세스(포트)에 걸쳐 떠 있으므로, 각 프로세스에 어떤 방이 열려 있고 입장 가능한지(정원, 게임 페이즈 등)를 프로세스 경계를 넘어 공유해야 한다 — 인메모리 Map으로는 안 되는 지점이라 Redis를 붙였다.
- 매칭 로직/데이터 모델(예: 방 상태 Hash, 입장 가능 방 Set)은 아직 구현 전이고, 우선 기초 연결 설정만 넣어둔 상태:
  - 로컬 실행: 루트 `docker-compose.yml`의 `redis` 서비스, `pnpm redis:up` / `pnpm redis:down`으로 기동/종료.
  - 클라이언트 라이브러리: `redis`(node-redis 공식) 패키지. `apps/game-room-server/src/redis.ts`(연결 후 `connectRedis()`를 index.ts 시작 시 await), `apps/web/src/lib/redis.ts`(Next dev HMR 대비 globalThis 캐싱 싱글턴, `getRedis()`로 lazy connect).
  - 접속 주소는 `REDIS_URL` 환경변수(기본값 `redis://localhost:6379`).
  - 프로젝트 전체가 휘발성 데이터 원칙이라 Redis도 영속 볼륨 없이 컨테이너 재시작 시 데이터가 날아가는 상태로 둔다.
- web이 멀티 인스턴스로 늘어나면 `room-registry.ts`의 in-memory Map(`room_id → port`)도 같은 Redis로 옮기는 게 확실한 다음 단계.

### 메시지 큐
- 아직 구체적인 용도는 정해지지 않았지만 다뤄보고 싶은 기술. 비교적 가벼운 RabbitMQ를 고려 중.

### 화면 렌더링
- 로비 화면과 인게임 화면(캔버스, 채팅, 타이머, 플레이어 목록)은 모두 **같은 Next.js 앱**의 다른 라우트로 렌더링한다(별도 프론트 앱으로 분리하지 않음).
- game-room-server는 화면을 그리지 않는 headless 서버다. 브라우저가 실시간 데이터를 받아 렌더링만 담당한다.

### 제외된 것
- **Nginx**: TLS 종료/라우팅용, 로컬 개발 범위에서는 제외(각 서비스에 직접 포트로 접속).
- **로그인/DB**: 이 서비스 특성상 도입하지 않음(익명 닉네임 기반).

## 디렉토리 구조
```
apps/web/                 # Next.js (App Router). 랜딩 + /room/[roomId] + /api/rooms
apps/game-room-server/    # ws 서버. src/room.ts(Room/RoomManager), src/index.ts(엔트리)
packages/shared/          # 클라이언트<->게임룸 서버 메시지 타입 공유
```

## 실행 방법
```bash
# 0) Redis 기동 (최초 1회 / 재부팅 후, Docker Desktop 필요)
pnpm redis:up

# 1) 게임룸 서버(멀티프로세스)를 PM2로 기동 (4001~4004 포트, 최초 1회 pnpm install 필요)
pnpm cluster:game-room

# 2) web 개발 서버 기동 (기본 3000 포트)
pnpm dev:web
```
브라우저에서 `http://localhost:3000` 접속 → 닉네임 입력 후 "방 만들기" → 다른 브라우저 탭에서 같은 방 코드로 "방 입장" 하면 서로의 입장/퇴장이 실시간으로 보인다.

PM2 프로세스 확인/종료: `pnpm --filter game-room-server exec pm2 list`, `pnpm --filter game-room-server exec pm2 delete all`
