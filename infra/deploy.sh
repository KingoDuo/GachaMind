#!/usr/bin/env bash
#
# gachaMind AWS 배포.
#   1) 앱 이미지 5개를 빌드해 ECR 에 push (태그 = git short sha)
#   2) terraform apply -var image_tag=<sha>  → 태스크 정의가 새 이미지를 가리키고 ECS 가 서비스를 갈아끼운다
#
# 사용법: infra/deploy.sh [build|push|apply|all]   (기본 all)
#   build  이미지만 빌드
#   push   빌드 + push
#   apply  terraform apply 만 (이미 push 된 태그로)
#   all    전부
#
# 처음 한 번은 ECR 저장소가 있어야 push 할 수 있으므로:
#   terraform -chdir=infra/terraform apply -target=aws_ecr_repository.app -var image_tag=x
#   infra/deploy.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
REGION="${AWS_REGION:-ap-northeast-2}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
# 태그 = git short sha. 커밋 안 된 변경이 있으면 -dirty 를 붙여 "이 sha 의 코드"라고 오해하지 않게 한다.
TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet HEAD -- . ':!infra' 2>/dev/null || echo -dirty)}"
SERVICES=(web matchmaking game-session user results-worker)

cmd="${1:-all}"

build() {
  for svc in "${SERVICES[@]}"; do
    echo "==> build $svc:$TAG"
    docker build --platform linux/arm64 --build-arg "SERVICE=$svc" \
      -t "$REGISTRY/gachamind/$svc:$TAG" -t "$REGISTRY/gachamind/$svc:latest" "$ROOT"
  done
}

push() {
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
  for svc in "${SERVICES[@]}"; do
    echo "==> push $svc:$TAG"
    docker push "$REGISTRY/gachamind/$svc:$TAG"
    docker push "$REGISTRY/gachamind/$svc:latest"
  done
}

apply() {
  echo "==> terraform apply (image_tag=$TAG)"
  terraform -chdir="$TF_DIR" apply -input=false -auto-approve -var "image_tag=$TAG"
}

case "$cmd" in
  build) build ;;
  push)  build; push ;;
  apply) apply ;;
  all)   build; push; apply ;;
  *) echo "usage: $0 [build|push|apply|all]" >&2; exit 1 ;;
esac
