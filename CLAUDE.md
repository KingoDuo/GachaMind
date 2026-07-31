# gachaMind

## 개요
[skribbl.io](https://skribbl.io/)를 모티프로 한 웹 캐치마인드(그림 맞추기) 서비스. 플레이어가 자유롭게 방을 만들고 참여하며, 한 방에 최대 100명까지 수용하는 것이 핵심 요구사항이다.

이 프로젝트의 주요 목적은 **여러 서버로 나뉜 아키텍처를 직접 설계·운영해보는 경험**을 쌓는 것이다. 그래서 트래픽이 검증되지 않은 초기 단계에도 역할별 서버 분리, 서비스 간 통신(Redis/MQ/HTTP), 데이터 소유 경계 같은 패턴을 의도적으로 먼저 적용한다. 익명 게스트 플레이는 유지하되, 회원가입/영속 데이터(전적 등)는 별도 서비스로 붙인다.

## 아키텍처

### 서비스 구성
역할이 다른 서버를 포트로 분리한 모노레포(pnpm workspace). 전부 Node/TypeScript.

| 서비스 | 역할 | 프레임워크 | 상태 |
|---|---|---|---|
| **web** | UI 렌더 + BFF(프론트도어). 브라우저의 유일한 진입점 | Next.js (App Router) | 무상태 |
| **matchmaking** | 방 탐색·배정. 어느 replica에 방이 있는지 관리 | Fastify | Redis 공유상태 |
| **game-session** | 실시간 게임 authority(그림·채팅·정답판정·게임루프). replica로 수평확장 | 프레임워크 없는 `ws` (또는 Colyseus) | 인메모리(휘발성) |
| **user** | 가입·로그인·프로필·전적 | NestJS + Postgres | 유일한 영속 DB 소유 |
| **results-worker** | 게임 결과 영속화·랭킹 집계 | Node + amqplib | 무상태 워커 |

인프라: **Redis**(매칭 공유상태, 향후 세션), **Postgres**(user DB), **RabbitMQ**(게임 이벤트 버스).

### 프레임워크 선택 근거
- **game-session은 프레임워크 없이** — 최대 100명이 그림 좌표를 스트리밍하는 핫패스라 순수 처리량·제어권 우선. 방 하나를 한 프로세스가 인메모리로 통째로 들고 있는 authoritative 모델(Colyseus/Socket.IO room과 같은 패턴)이라, 요청-수명주기 중심의 무거운 프레임워크는 오히려 안 맞는다. socket.io도 자체 프로토콜 오버헤드 + native WebSocket 포기 때문에 쓰지 않는다(하트비트·재연결은 직접 구현).
- **user는 NestJS** — CRUD + DI + 인증 + ORM이 필요한 전형적 요청-응답 도메인이라 Nest가 빛나는 자리.
- **web은 Next.js** — 실질적인 UI(캔버스·채팅·타이머)를 렌더하고, 실시간 핫패스는 우회(아래)하므로 처리량 부담이 없다.

### 데이터 소유 원칙 (핵심 규율)
> **각 데이터에는 주인 서비스가 하나뿐이다. 다른 서비스는 그 DB를 직접 읽거나 쓰지 않는다.**

- **user만 영속 DB(Postgres)를 소유**한다. game-session 상태는 인메모리로 휘발성.
- 서비스 간 접근은 정해진 통로로만: **Redis**(공유 상태/세션), **RabbitMQ**(이벤트), **HTTP API**(동기 질의).
- "서버마다 DB"가 아니라 "데이터마다 주인 하나". 대부분의 서비스는 자기 DB가 없다(무상태).

### 엣지 vs 내부 (통신 경로)
상호작용의 성격에 따라 경로를 나눈다.

- **엣지(브라우저가 직접 접근, 호스트 포트 공개):**
  - `web`(3000) — UI/BFF.
  - `game-session`(4001~) — 클라이언트가 **WebSocket으로 직접 접속**. 초당 수백~수천 건 실시간이라 web을 거치지 않는다.
- **내부(web/서비스만 호출):**
  - `matchmaking`·`user`·`results-worker` — 브라우저는 직접 안 부른다.

**유저 데이터 조회는 BFF 경로**로: `브라우저 → web → user`. web은 데이터를 소유/캐싱하지 않는 통로이자, 세션쿠키↔토큰 변환 지점이며, user 서비스를 외부에 노출하지 않는 방패다.

### 방 배정(매칭) 흐름
1. 브라우저가 web(BFF)에 요청 → web이 **matchmaking**에 위임.
2. matchmaking이 Redis를 조회해 배정을 정함:
   - `room:{roomId}` Hash `{ port, capacity, playerCount }`, `rooms:joinable` Set(정원 남은 방).
   - **빠른 매칭**: `rooms:joinable`에서 무작위로 하나 골라 난입("진행 중인 방에 랜덤 난입"이 기본 옵션). 없으면 새 방.
   - **새 방**: least-connections로 가장 한가한 game-session replica 포트에 배정.
3. 클라이언트는 배정받은 포트의 game-session에 WS로 직접 연결.
4. game-session은 **occupancy(playerCount)와 joinable 소속만** Redis에 갱신하고, 방이 비면 matchmaking에 정리 콜백(DELETE)을 보낸다.

핵심: **occupancy의 source of truth는 game-session 인메모리**이고 Redis는 그 projection(사본)이다. matchmaking의 Redis 조회는 "제안"일 뿐, 정원 최종 판정은 authority인 game-session이 WS join 시점에 한다(꽉 차면 `room-full`로 튕김).

### Redis
- **확정 용도 — 방 매칭 공유상태**: game-session이 여러 replica에 흩어져 있으므로, 어떤 방이 어느 포트에 열려 있고 입장 가능한지를 프로세스 경계 너머로 공유해야 한다. matchmaking이 이 인덱스를 읽는다.
- **향후 용도 — 세션/신원 브릿지**: user가 로그인 토큰을 발급하고 game-session이 검증할 때, 공유 세션 저장소로 쓸 수 있다(JWT 로컬검증 vs Redis 세션 중 택1).
- **클라이언트는 `ioredis`로 통일** — Redis를 쓰는 모든 서비스는 node-redis가 아니라 ioredis를 쓴다(자동 연결·재연결, Cluster/Sentinel 성숙, BullMQ 등 생태계 호환). 명령어는 소문자(`hset`/`hgetall`).
- 휘발성 원칙에 따라 영속 볼륨 없이 운영.

### RabbitMQ (메시지 큐)
- **용도 — 게임 종료 후처리**: game-session이 게임 종료 시 결과 이벤트를 `game.events` 큐에 발행 → **results-worker**가 소비해 user DB에 전적/통계를 영속화. 휘발성 게임 도메인 → 영속 유저 도메인을 잇는 **비동기 브릿지**.
- 로비↔게임 사이의 "연결"용이 아니라(그건 Redis/HTTP로 충분), 게임서버 "뒤"의 비동기 side-work용이다.

### 화면 렌더링
- 로비/인게임 화면 모두 **같은 Next.js 앱**의 다른 라우트로 렌더링. game-session은 화면을 그리지 않는 headless 서버.

### 제외/유보된 것
- **Nginx/게이트웨이**: 로컬 개발 범위에선 제외(각 서비스에 직접 포트로 접속). 라우팅이 복잡해지면 그때 도입.
- **하트비트·자동 재연결**: 아직 미구현. game-session에 ping/pong(죽은 연결 정리)과 클라 재연결은 반드시 채워야 할 자리.
- **로그인 강제**: 게스트(익명 닉네임) 플레이를 유지하고, 회원가입은 선택.

## 디렉토리 구조
```
apps/
  web/             # Next.js — UI + BFF.  /api/rooms 는 matchmaking으로 프록시
  matchmaking/     # Fastify — 방 배정 (Redis 매칭 상태 소유)
  game-session/    # ws — 실시간 authority. src/room.ts(Room/RoomManager), src/index.ts
  user/            # NestJS + TypeORM(Postgres). 가입·프로필·전적
  results-worker/  # Node + amqplib — 게임 이벤트 소비 → user DB
packages/
  shared/          # 서비스 간 계약 (메시지 타입, Redis 키, MQ 이벤트 스키마)
infra/
  docker-compose.yml   # redis + postgres + rabbitmq + 5개 서비스
```

## 실행 방법
```bash
pnpm install

# A) 인프라만 docker + 서비스는 로컬 개발
./docker.sh infra      # redis + postgres + rabbitmq
pnpm dev:web           # dev:web / dev:matchmaking / dev:game-session / dev:user / dev:worker

# B) 전부 docker
./docker.sh start      # 5개 서비스 + 인프라 빌드/기동  (내리기: ./docker.sh stop)
```
도커 오케스트레이션은 루트 `docker.sh`로 일원화(`start`/`rebuild`/`stop`/`restart`/`infra`/`logs`/`ps`/`clean`). `./docker.sh help` 참고.
Docker build context는 repo 루트다(shared + lockfile 때문). 서비스 간엔 컨테이너명(`redis`/`postgres`/`rabbitmq`/`matchmaking`)으로 통신한다. 환경변수 예시는 `.env.example` 참고.

> **주의:** pnpm 11.10은 Node 22.13+를 요구한다(`packageManager` 핀).

## 현재 상태 (스캐폴딩)
각 서비스는 **부팅 + health 응답 수준**이고, 실제 로직은 `TODO` 주석 자리에서 채워나간다:
- matchmaking: `/assign`·`/rooms` 가 501 stub — Redis 매칭·least-conn 배정 구현 필요.
- game-session: join/leave 브로드캐스트만 — 드로잉/채팅/정답판정/게임루프, Redis occupancy 동기화, matchmaking 콜백 구현 필요.
- user: `/health` + TypeORM 연결 + `User` 엔티티 뼈대만 — 엔티티 확정, 인증(가입/로그인/토큰), 프로필·전적 API 구현 필요. (`synchronize: true`는 dev 편의, 프로덕션 전 마이그레이션으로 전환)
- results-worker: 부팅 로그만 — amqplib 연결·`game.events` 소비·user DB 기록 구현 필요.
- 공유 계약(`packages/shared`)에 이미 메시지 타입/Redis 키/이벤트 스키마의 뼈대가 있다.
