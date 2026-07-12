# gachaMind

skribbl.io 모티프의 웹 캐치마인드. **서버 아키텍처(멀티서비스) 설계 경험**이 주요 목적이라, 역할별로 서버를 나눈 모노레포로 구성한다.

## 구조

```
apps/
  web/             # Next.js — UI 렌더 + BFF(프론트도어).  브라우저의 유일한 진입점
  matchmaking/     # Fastify — 방 탐색·배정 (Redis 매칭 상태 소유)
  game-session/    # ws     — 실시간 게임 authority (인메모리, 수평확장 replica)
  user/            # NestJS — 가입·로그인·프로필·전적 (Postgres 소유)
  results-worker/  # Node   — 게임결과 영속화 (RabbitMQ 소비 → user DB)
packages/
  shared/          # 서비스 간 계약 (메시지 타입, Redis 키, 이벤트 스키마)
infra/
  docker-compose.yml   # redis + postgres + rabbitmq + 5개 서비스
```

### 데이터 소유 원칙
- 각 데이터에는 주인 서비스가 하나뿐. 남의 DB를 직접 만지지 않는다.
- **user**만 영속 DB(Postgres)를 소유. game-session은 인메모리(휘발성).
- 서비스 간 통신은 **Redis**(공유 상태/세션), **RabbitMQ**(이벤트), **HTTP**(동기 질의)로만.

### 엣지 vs 내부
- **엣지(호스트 포트 공개):** `web`(3000), `game-session`(4001~) — 브라우저가 직접 접속.
- **내부:** `matchmaking`·`user`·`results-worker` — web(BFF)이나 다른 서비스만 호출.

## 실행

```bash
pnpm install

# A) 인프라만 docker로 + 서비스는 로컬에서 개발
./docker.sh infra            # redis + postgres + rabbitmq
pnpm dev:web                 # 개별 서비스: dev:web / dev:matchmaking / dev:game-session / dev:user / dev:worker

# B) 전부 docker로
./docker.sh start            # 5개 서비스 + 인프라 빌드/기동
./docker.sh help             # start / rebuild / stop / restart / logs / ps / clean
```

> 현재는 **스캐폴딩 단계**다. 각 서비스는 부팅 + health 응답 수준이며, 매칭 로직·게임 프로토콜·인증·MQ 소비는 `TODO` 주석 자리에서 함께 채운다.
