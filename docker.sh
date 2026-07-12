#!/usr/bin/env bash
#
# gachaMind 도커 오케스트레이션.
# 모든 서비스(web/matchmaking/game-session/user/results-worker) + 인프라(redis/postgres/rabbitmq)를
# 하나의 compose 파일로 빌드·실행한다.
#
# 사용법: ./docker.sh <command> [service]
#
set -euo pipefail

# 스크립트 위치 기준으로 동작(어디서 실행하든 무방).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/infra/docker-compose.yml"

# docker compose(v2) 우선, 없으면 docker-compose(v1) 폴백.
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose -f "$COMPOSE_FILE")
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose -f "$COMPOSE_FILE")
else
  echo "error: docker compose 를 찾을 수 없습니다. Docker Desktop을 실행하세요." >&2
  exit 1
fi

# 인프라 서비스명(전체 대신 인프라만 띄울 때 사용).
INFRA=(redis postgres rabbitmq)

usage() {
  cat <<'EOF'
gachaMind docker 오케스트레이션

사용법: ./docker.sh <command> [service]

commands:
  start [svc]     전체(또는 특정 서비스) 이미지 빌드 후 백그라운드 실행
  rebuild [svc]   이미지를 강제로 다시 빌드(--no-cache)하고 실행
  stop            전체 중지 및 컨테이너 제거
  restart [svc]   중지 후 재실행
  infra           인프라(redis/postgres/rabbitmq)만 실행
  logs [svc]      로그 실시간 추적 (svc 생략 시 전체)
  ps              실행 중인 서비스 상태
  clean           전체 중지 + 볼륨/로컬 이미지까지 제거
  help            이 도움말

예시:
  ./docker.sh start            # 전부 빌드·실행
  ./docker.sh start web        # web만
  ./docker.sh rebuild user     # user 이미지 캐시 무시하고 재빌드·실행
  ./docker.sh logs matchmaking # matchmaking 로그
  ./docker.sh infra            # 인프라만 (서비스는 pnpm dev로 로컬 실행할 때)
EOF
}

cmd="${1:-help}"
svc="${2:-}"

case "$cmd" in
  start)
    "${DC[@]}" up -d --build ${svc:+"$svc"}
    "${DC[@]}" ps
    ;;
  rebuild)
    "${DC[@]}" build --no-cache ${svc:+"$svc"}
    "${DC[@]}" up -d ${svc:+"$svc"}
    "${DC[@]}" ps
    ;;
  stop)
    "${DC[@]}" down
    ;;
  restart)
    "${DC[@]}" down
    "${DC[@]}" up -d --build ${svc:+"$svc"}
    "${DC[@]}" ps
    ;;
  infra)
    "${DC[@]}" up -d "${INFRA[@]}"
    "${DC[@]}" ps
    ;;
  logs)
    "${DC[@]}" logs -f ${svc:+"$svc"}
    ;;
  ps|status)
    "${DC[@]}" ps
    ;;
  clean)
    "${DC[@]}" down -v --rmi local
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "error: 알 수 없는 명령 '$cmd'" >&2
    echo >&2
    usage
    exit 1
    ;;
esac
