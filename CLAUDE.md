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

**샤드는 포트가 아니라 이름으로 가린다.** game-session 프로세스마다 `SHARD_ID`(AWS 는 `1`, `2` …)가 있고 Redis 사본·배정 응답·접속 경로(`/gs/{shard}`)가 전부 이 이름을 쓴다. 인스턴스가 여러 대면 같은 포트가 여러 샤드에 있어 포트로는 못 가리기 때문이다. 로컬(pnpm dev/compose)은 프록시가 없어 브라우저가 포트로 직접 붙어야 하므로 `SHARD_ID`를 안 주면 포트가 이름이 된다(`4001`, `4002`). matchmaking 은 `GAME_SESSION_SHARDS`로 후보 목록을 받는다.
- **내부(web/서비스만 호출):**
  - `matchmaking`·`user`·`results-worker` — 브라우저는 직접 안 부른다.

**유저 데이터 조회는 BFF 경로**로: `브라우저 → web → user`. web은 데이터를 소유/캐싱하지 않는 통로이자, 세션쿠키↔토큰 변환 지점이며, user 서비스를 외부에 노출하지 않는 방패다.

### 방 배정(매칭) 흐름
1. 브라우저가 web(BFF)에 요청 → web이 **matchmaking**에 위임.
2. matchmaking이 Redis를 조회해 배정을 정함:
   - `room:{roomId}` Hash `{ shard, capacity, playerCount, phase }`, `rooms:joinable` Set(정원 남은 방), `session:{shard}` Hash(샤드별 부하).
   - **빠른 매칭**: `rooms:joinable`에서 무작위로 하나 골라 난입("진행 중인 방에 랜덤 난입"이 기본 옵션). 없으면 새 방.
   - **새 방**: least-connections로 가장 한가한 game-session 샤드에 배정.
3. 클라이언트는 배정받은 샤드의 game-session에 WS로 직접 연결.
4. game-session은 **occupancy(playerCount)와 joinable 소속만** Redis에 갱신하고, 방이 비면 matchmaking에 정리 콜백(DELETE)을 보낸다.

방 코드는 사람이 부르고 받아 적는 값이라 5자리 Crockford Base32(`packages/shared`의 `generateRoomCode`)다. 짧은 만큼 충돌이 가능해서 matchmaking이 Redis `HSETNX`로 코드를 선점해야 확정된다. 코드를 받는 입구(web 입장 폼·URL, matchmaking 조회, game-session join)는 전부 `normalizeRoomCode`를 통과시켜 대소문자·O/0 표기 차이를 흡수한다.

핵심: **occupancy의 source of truth는 game-session 인메모리**이고 Redis는 그 projection(사본)이다. matchmaking의 Redis 조회는 "제안"일 뿐, 정원 최종 판정은 authority인 game-session이 WS join 시점에 한다(꽉 차면 `room-full`로 튕김).

### Redis
- **확정 용도 — 방 매칭 공유상태**: game-session이 여러 샤드에 흩어져 있으므로, 어떤 방이 어느 샤드에 열려 있고 입장 가능한지를 프로세스 경계 너머로 공유해야 한다. matchmaking이 이 인덱스를 읽는다.
- **세션/신원 브릿지에는 쓰지 않는다**: user가 발급한 JWT를 game-session이 같은 `JWT_SECRET`으로 로컬 검증한다(아래 "계정과 세션"). join 핫패스에 Redis 조회가 생기지 않는다.
- **클라이언트는 `ioredis`로 통일** — Redis를 쓰는 모든 서비스는 node-redis가 아니라 ioredis를 쓴다(자동 연결·재연결, Cluster/Sentinel 성숙, BullMQ 등 생태계 호환). 명령어는 소문자(`hset`/`hgetall`).
- 휘발성 원칙에 따라 영속 볼륨 없이 운영.

### RabbitMQ (메시지 큐)
- **용도 — 게임 종료 후처리**: game-session이 게임 종료 시 결과 이벤트를 `game.events` 큐에 발행 → **results-worker**가 소비해 user DB에 전적/통계를 영속화. 휘발성 게임 도메인 → 영속 유저 도메인을 잇는 **비동기 브릿지**.
- 로비↔게임 사이의 "연결"용이 아니라(그건 Redis/HTTP로 충분), 게임서버 "뒤"의 비동기 side-work용이다.

### 화면 렌더링
- 로비/인게임 화면 모두 **같은 Next.js 앱**의 다른 라우트로 렌더링. game-session은 화면을 그리지 않는 headless 서버.
- 화면은 셋: `/`(닉네임 입력) → `/lobby`(방 목록·방 만들기·빠른 시작·코드 입장) → `/room/{코드}`(게임).
- 방 목록은 `GET /api/rooms` → matchmaking `GET /rooms`. **최초 진입 1회 + 새로고침 버튼**으로만 받는 스냅샷이다(폴링·구독 없음). 참여 가능한 방(`rooms:joinable`)만 나오므로 정원이 찬 방과 아직 아무도 접속하지 않은 예약 방은 빠진다.
- 닉네임은 sessionStorage(`gachamind:nickname`)에 둔다. 쿼리스트링으로 나르면 방 링크를 복사해 줄 때 남의 닉네임이 따라간다. 닉네임 없이 방 링크로 들어오면 `/?next=/room/{코드}`로 보내 입력받고 되돌린다. 로그인한 사람도 같은 자리에 계정 닉네임을 넣으므로 로비·방 화면은 게스트/회원을 구분하지 않는다.

### 계정과 세션
- **게스트와 회원이 공존**한다. 입구(`/`)에서 아이디/비밀번호로 가입·로그인하거나, 닉네임만 넣고 "게스트로 플레이"한다. 회원은 `users.username`(로그인 아이디, unique, 공백 뺀 출력 가능 ASCII)과 `users.nickname`(표시용, 중복 허용, 게스트와 같은 규칙)을 갖는다. 비밀번호는 1~72자(bcrypt 한계) 출력 가능 ASCII. 규칙 상수는 `packages/shared`에 있고, user 서비스는 빌드 제약으로 `apps/user/src/auth/rules.ts`에 같은 값을 한 벌 더 둔다.
- **세션은 httpOnly 쿠키**(`gachamind_session`, 7일). 브라우저 → web `/api/auth/{signup,login,logout,me}` → user `/auth/*`. web이 user가 준 JWT를 쿠키로 심고, 다시 부를 땐 쿠키를 Bearer로 바꿔 user에 전달한다. 브라우저 JS는 토큰을 만지지 않고, user 서비스는 외부에 노출되지 않는다.
- **game-session은 WS 핸드셰이크의 쿠키로 "누구"인지 안다.** 같은 도메인(로컬은 같은 호스트)이라 쿠키가 자동으로 실리고, `JWT_SECRET`으로 로컬 검증한다(`apps/game-session/src/auth.ts`). 유효하면 닉네임·userId를 토큰에서 쓰고(join 메시지의 닉네임은 무시, 사칭 방지), 없거나 깨졌으면 게스트(userId null). 접속을 막지는 않는다.
- 전적(`game_players.user_id`)은 회원만 채워지고 게스트는 null. 전적 **조회** API와 화면은 아직 없다(다음 단계: 누가 `game_players`를 읽을지 정하기).

### 제외/유보된 것
- **Nginx/게이트웨이**: 로컬 개발 범위에선 제외(각 서비스에 직접 포트로 접속). 라우팅이 복잡해지면 그때 도입.
- **하트비트·자동 재연결**: 아직 미구현. game-session에 ping/pong(죽은 연결 정리)과 클라 재연결은 반드시 채워야 할 자리.
- **로그인 강제**: 게스트(익명 닉네임) 플레이를 유지하고, 회원가입은 선택.
- **비밀번호 찾기·닉네임 변경·refresh 토큰**: 없음. 세션은 7일 JWT 하나로 끝.

## 디렉토리 구조
```
apps/
  web/             # Next.js — UI + BFF.  /api/rooms 는 matchmaking, /api/auth 는 user 로 프록시(세션 쿠키↔토큰)
                   #   app/(입구) app/lobby app/room/[roomId], features/{auth,lobby,room,player,ui}
  matchmaking/     # Fastify — 방 배정 (Redis 매칭 상태 소유)
  game-session/    # ws — 실시간 authority. src/room.ts(Room/RoomManager), src/index.ts
  user/            # NestJS + TypeORM(Postgres). 가입·로그인·JWT 발급 (users 테이블 소유)
  results-worker/  # Node + amqplib — 게임 이벤트 소비 → games/game_players 기록
packages/
  shared/          # 서비스 간 계약 (메시지 타입, Redis 키, MQ 이벤트 스키마)
infra/
  docker-compose.yml   # redis + postgres + rabbitmq + 5개 서비스
Dockerfile         # 5개 서비스 공용. SERVICE 빌드 인자로 어느 앱의 이미지인지 정한다
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
Docker 이미지는 루트 `Dockerfile` 하나로 만든다(`--build-arg SERVICE=<앱이름>`, 멀티스테이지 → 서비스별로 그 앱의 prod 의존성만 든 얇은 이미지). build context는 repo 루트다(shared + lockfile 때문). 서비스 간엔 컨테이너명(`redis`/`postgres`/`rabbitmq`/`matchmaking`)으로 통신한다. 환경변수 예시는 `.env.example` 참고.

> **주의:** pnpm 11.10은 Node 22.13+를 요구한다(`packageManager` 핀).

## AWS 배포
계정 `472227100986` / 서울(`ap-northeast-2`) / 도메인 `gachamind.com`(Route53). 인프라는 `infra/terraform`(Terraform, 상태는 S3 `gachamind-tfstate-…`), 배포는 `infra/deploy.sh`.
- **현재 형태**: ECS on EC2, 인스턴스는 두 부류(arm64, `bridge` 네트워크·동적 호스트 포트). compose 의 서비스 9개가 ECS 서비스 9개로 1:1 대응한다.
  - **core** 한 대 고정(`aws_instance`, t4g.small): 상태 있는 redis/postgres/rabbitmq 만. 인스턴스 ID 로 placement constraint 를 건다(Postgres 데이터가 이 디스크에 있어 갈아엎으면 사라진다).
  - **app** ASG(`gachamind-app`, t4g.medium, 0~4대): web/matchmaking/user/worker/game-session 샤드. 이 ASG 는 **ECS capacity provider** `gachamind-app` 으로 묶여 있고, app 서비스는 `launch_type` 대신 이 capacity provider 로 뜬다. 대수는 사람이 아니라 ECS 관리형 스케일링이 정한다 — 태스크를 놓을 자리가 모자라면 인스턴스 +1, 비면 -1(target 100 = 남는 인스턴스 없이). 줄일 때 managed draining 이 태스크를 정상 종료시키지만 그 인스턴스의 game-session 샤드 방은 끊긴다. 태스크 수(`desired_count`)는 아직 고정 1 — 인스턴스가 늘어나는 걸 보려면 태스크 수를 올려 자리를 모자라게 만들어야 한다.
  - **켜고 끄기는 `infra/env.sh up [max] | down | status`**. 켜기 = core 기동 + ASG max 복구(태스크 6개가 자리를 요구하니 ECS 가 인스턴스를 띄운다), 끄기 = ASG max 0(인스턴스 정리) → core 정지. Terraform 은 ASG 의 desired/max 변경을 무시한다. 정지 중 남는 비용은 ALB 공인 IPv4 2개·core EBS·Route53 존. 서비스 간 호출은 **ECS Service Connect** 로 compose 와 같은 이름(`http://matchmaking:4000`, `redis://redis:6379`, `postgres:5432`)을 쓴다 — 태스크마다 붙는 프록시가 이름을 실제 (인스턴스, 포트)로 풀어주므로 인스턴스가 늘어도 env 값이 안 바뀐다. Redis/Postgres/RabbitMQ 도 아직 컨테이너(Postgres 는 `/data/postgres` 호스트 볼륨).
- **ALB ↔ ECS 연동**: 타깃그룹의 내용물은 Terraform 이 아니라 **ECS 가 채운다**(`aws_ecs_service.load_balancer`). 태스크가 뜨면 (인스턴스, 동적 포트)가 등록되고 내려가면 빠진다. 무상태 서비스는 롤링(min 100/max 200)이라 새 태스크가 헬스체크를 통과한 뒤 옛 태스크가 빠지고, game-session 샤드·postgres 는 같은 것 둘이 공존하면 안 되므로 "내리고 올리기"(min 0/max 100). web `desired_count` 를 2로 올리면 ALB 가 두 태스크로 분산한다.
- **입구는 ALB + ACM(HTTPS)**: Route53 apex/www → ALB Alias. `:80`→443 리다이렉트, `:443` 기본 → web 타깃그룹, **`/gs/{shard}/*` → 해당 game-session 샤드 타깃그룹**(`game_session_shards` 변수, 샤드 서비스 이름은 `game-session-{shard}`). EC2 SG 는 동적 포트 범위(32768~65535)를 ALB 와 같은 SG(Service Connect 프록시 간)에서만 받는다. 클라이언트는 https 페이지면 `wss://도메인/gs/{shard}`, http(로컬)면 `ws://host:{shard}` 로 붙는다(`useRoomSocket.ts`). game-session 은 같은 포트에 `GET /health`(ALB 헬스체크)와 30s WS ping(ALB idle timeout·유령 연결 정리)을 가진다. web 헬스체크는 `/api/health`.
- 비밀값(Postgres 비밀번호, `DATABASE_URL`, `JWT_SECRET`)은 Terraform 이 생성해 SSM Parameter Store 에 두고 태스크 정의가 ARN 으로 참조한다.
- 브랜치: 기본 브랜치는 **`dev`**(작업 브랜치). `main` 은 배포 브랜치라 직접 push 를 막고 **dev → main PR 머지로만** 반영한다(GitHub ruleset `protect-main`: PR 필수·force push/삭제 금지). main 에 머지되는 순간이 배포 시점. 환경이 꺼져 있으면(env.sh down) apply 는 성공하되 새 태스크는 켤 때까지 대기한다(circuit breaker 가 롤백했으면 `deploy.sh apply` 로 다시 밀기).
- 배포: **main 에 push 되면 GitHub Actions**(`.github/workflows/deploy.yml`)가 바뀐 앱만 arm64 이미지로 빌드(QEMU)·ECR push(태그 = 커밋 sha)하고, `image_tags` map(바뀐 앱 = 새 sha, 나머지 = 지금 배포된 태그)으로 `terraform apply` → 바뀐 서비스만 재배포(무상태 서비스는 무중단, 샤드는 몇 초 끊김). `packages/shared`·`Dockerfile`·lockfile 이 바뀌면 전부. AWS 권한은 OIDC 롤 `gachamind-github-deploy`(main 브랜치만). 수동 배포는 `infra/deploy.sh [all|build|push|apply] [service ...]`.
- 접속/로그: SSH 없음. `aws ssm start-session --target <instance_id>`, 로그는 CloudWatch `/gachamind/<service>`(Service Connect 프록시 로그는 같은 그룹의 `service-connect/` 스트림).
- 다음 단계(미정): web 태스크 오토스케일링(Application Auto Scaling, ALB 타깃당 요청 수) + 부하 실험 — 이게 붙어야 인스턴스 자동 스케일링이 실제로 움직인다. 관리형 데이터 계층(RDS/ElastiCache/Amazon MQ)으로 core 제거.

## 현재 상태
- matchmaking: Redis 매칭·least-conn 배정·방 목록 구현됨.
- game-session: 드로잉/채팅/정답판정/게임루프, Redis occupancy 동기화, matchmaking 콜백, 세션 쿠키 신원 확인 구현됨. 클라이언트 자동 재연결은 없음.
- user: 가입/로그인/`me` 구현됨. 프로필·전적 조회 API는 없음. (`synchronize: true`는 dev 편의, 프로덕션 전 마이그레이션으로 전환. `users`에 `username` 컬럼이 추가돼 이전 스키마의 행이 있으면 기동이 실패한다 → 테이블을 비우고 다시 띄운다)
- results-worker: `game.events` 소비 → `games`/`game_players` 기록 구현됨(멱등). 이 두 테이블은 worker가 직접 만든다 — "user만 DB 소유" 원칙과 어긋나는 지점이라 전적 조회를 붙일 때 정리한다.
- 공유 계약(`packages/shared`)에 이미 메시지 타입/Redis 키/이벤트 스키마의 뼈대가 있다.
