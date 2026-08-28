# syntax=docker/dockerfile:1.7
#
# 모든 서비스가 공유하는 단일 Dockerfile. 어떤 서비스의 이미지를 만들지는 SERVICE 빌드 인자로 정한다.
#   docker build --build-arg SERVICE=game-session -t gachamind/game-session .
# build context는 repo 루트여야 한다(shared 패키지 + lockfile 때문).
#
# 조리법은 5개 서비스가 전부 같다(Node + pnpm workspace). 다른 건 "어느 앱을 빌드/실행하느냐"뿐이라
# 파일을 서비스마다 두지 않고 하나로 둔다. 단, 이미지는 서비스마다 따로 나온다 —
# 각 이미지에는 그 앱과 그 앱이 의존하는 workspace 패키지(shared)의 런타임 의존성만 들어간다.
# 그래서 서비스 하나를 고치면 그 서비스 이미지만 바뀌고, 그 서비스만 재배포된다.
#
# 스테이지:
#   manifests  lockfile + 모든 package.json. 소스는 없다 → 의존성 설치 레이어가 소스 변경에 무관하게 캐시된다.
#   build      선택한 앱의 전체 의존성(devDeps 포함) 설치 + 빌드(next build / nest build).
#   runtime    선택한 앱의 프로덕션 의존성만 설치 + build 결과물 복사. 최종 이미지.
#
# pnpm의 콘텐츠 저장소(store)와 레지스트리 메타데이터 캐시는 --mount=type=cache 로 빌더에만 두고
# 이미지에는 넣지 않는다. 안 그러면 런타임 이미지에 수백 MB의 캐시가 딸려 들어간다.

ARG NODE_VERSION=22

# ── 공통 베이스 ──────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
# packageManager 핀(pnpm@11.10.0)과 같은 버전을 쓴다. 다르면 pnpm이 핀 버전을 다시 받으려 한다.
RUN npm i -g pnpm@11.10.0 && rm -rf /root/.npm
WORKDIR /app

# ── 매니페스트만 ─────────────────────────────────────────────────────────────
# workspace 전체의 package.json이 있어야 --frozen-lockfile 검사가 통과한다(소스는 필요 없다).
# 새 앱/패키지를 추가하면 여기에 한 줄 추가한다.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/matchmaking/package.json apps/matchmaking/
COPY apps/game-session/package.json apps/game-session/
COPY apps/user/package.json apps/user/
COPY apps/results-worker/package.json apps/results-worker/

# ── 빌드 ────────────────────────────────────────────────────────────────────
FROM manifests AS build
ARG SERVICE
# "${SERVICE}..." = 그 앱 + 그 앱이 의존하는 workspace 패키지들(shared)만 설치.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-cache,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --filter "${SERVICE}..."
COPY packages/shared packages/shared
COPY apps/${SERVICE} apps/${SERVICE}
# build 스크립트가 있는 앱(web/user)만 빌드된다. tsx로 바로 실행하는 앱은 빌드가 없다.
RUN pnpm --filter "${SERVICE}" run --if-present build
# 런타임 스테이지로 옮길 때 dev 의존성 심볼릭 링크와 빌드 캐시는 두고 간다.
RUN rm -rf "apps/${SERVICE}/node_modules" "apps/${SERVICE}/.next/cache" packages/shared/node_modules

# ── 런타임 ──────────────────────────────────────────────────────────────────
FROM manifests AS runtime
ARG SERVICE
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-cache,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --prod --filter "${SERVICE}..."
# 소스/빌드 결과물을 올린다. build 스테이지에서 node_modules를 지웠으므로 위에서 설치한 prod 링크는 그대로 남는다.
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/${SERVICE} apps/${SERVICE}
WORKDIR /app/apps/${SERVICE}
CMD ["pnpm", "start"]
