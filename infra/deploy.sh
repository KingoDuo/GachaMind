#!/usr/bin/env bash
#
# gachaMind AWS 수동 배포. 평소엔 GitHub Actions(.github/workflows/deploy.yml)가 같은 일을 하고,
# 이 스크립트는 로컬에서 급히 올리거나 Actions 가 막혔을 때 쓴다.
#
#   1) 대상 서비스 이미지를 빌드해 ECR 에 push (태그 = git sha, 커밋 안 된 변경이 있으면 -dirty)
#   2) terraform apply -var image_tags={...}
#      대상 서비스 = 새 태그, 나머지 = 지금 ECS 에 배포된 태그 그대로 → 대상 서비스만 재시작된다.
#
# 사용법: infra/deploy.sh [build|push|apply|all] [service ...]
#   서비스를 안 적으면 5개 전부. 예) infra/deploy.sh all web game-session
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
REGION="${AWS_REGION:-ap-northeast-2}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet HEAD -- . ':!infra' 2>/dev/null || echo -dirty)}"
ALL_SERVICES=(web matchmaking game-session user results-worker)

cmd="${1:-all}"; shift || true
SERVICES=("$@")
# build/push/all 은 서비스를 안 적으면 전부. apply 만 단독으로 부를 땐 "새로 push 한 것"이 없으니
# 서비스를 명시하지 않는 한 지금 배포된 태그를 그대로 다시 적용한다(인프라 변경만 반영).
if [ ${#SERVICES[@]} -eq 0 ] && [ "$cmd" != "apply" ]; then SERVICES=("${ALL_SERVICES[@]}"); fi

build() {
  for svc in "${SERVICES[@]}"; do
    echo "==> build $svc:$TAG"
    docker build --platform linux/arm64 --build-arg "SERVICE=$svc" \
      -t "$REGISTRY/gachamind/$svc:$TAG" "$ROOT"
  done
}

push() {
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
  for svc in "${SERVICES[@]}"; do
    echo "==> push $svc:$TAG"
    docker push "$REGISTRY/gachamind/$svc:$TAG"
  done
}

# 지금 ECS 서비스가 실제로 쓰는 태스크 정의의 태그(최신 리비전이 아니라 — 롤백됐을 수 있으니).
# game-session 은 샤드 서비스(game-session-4001…) 중 첫 번째를 대표로 본다. 서비스가 없으면(첫 배포) 빈 값.
current_tag() {
  local svc="$1"; [ "$svc" = "game-session" ] && svc="game-session-4001"
  local td
  td=$(aws ecs describe-services --region "$REGION" --cluster gachamind --services "$svc"     --query 'services[0].taskDefinition' --output text 2>/dev/null || true)
  [ -z "$td" ] || [ "$td" = "None" ] && return 0
  aws ecs describe-task-definition --region "$REGION" --task-definition "$td" \
    --query 'taskDefinition.containerDefinitions[0].image' --output text 2>/dev/null | sed 's/.*://' || true
}

apply() {
  local pairs=()
  for svc in "${ALL_SERVICES[@]}"; do
    local tag
    if [ ${#SERVICES[@]} -gt 0 ] && printf '%s\n' "${SERVICES[@]}" | grep -qx "$svc"; then tag="$TAG"; else tag="$(current_tag "$svc")"; tag="${tag:-$TAG}"; fi
    # 그 태그의 이미지가 ECR 에 실제로 있어야 한다. 없으면 존재하지 않는 이미지로 배포되어 서비스가 내려간다.
    if ! aws ecr describe-images --region "$REGION" --repository-name "gachamind/$svc" --image-ids "imageTag=$tag" >/dev/null 2>&1; then
      echo "error: gachamind/$svc:$tag 이미지가 ECR 에 없다 — 배포 중단" >&2; exit 1
    fi
    pairs+=("\"$svc\"=\"$tag\"")
  done
  local var="{$(IFS=,; echo "${pairs[*]}")}"
  echo "==> terraform apply image_tags=$var"
  terraform -chdir="$TF_DIR" apply -input=false -auto-approve -var "image_tags=$var"
}

case "$cmd" in
  build) build ;;
  push)  build; push ;;
  apply) apply ;;
  all)   build; push; apply ;;
  *) echo "usage: $0 [build|push|apply|all] [service ...]" >&2; exit 1 ;;
esac
