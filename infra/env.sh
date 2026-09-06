#!/usr/bin/env bash
#
# gachaMind AWS 환경 켜고 끄기. 인스턴스는 두 부류다(infra/terraform/ec2.tf).
#   core  한 대 고정(aws_instance). redis/postgres/rabbitmq. 끌 때는 EC2 를 정지한다(디스크의 Postgres 데이터는 남는다).
#   app   ASG. web/matchmaking/user/worker/game-session 샤드. 끌 때는 desired 를 0 으로 내려 인스턴스를 없앤다.
#
# 사용법: infra/env.sh up [app 대수=1] | down | status
#   up      core 기동 → app ASG desired 조정. ECS 가 인스턴스 등록을 보고 태스크를 알아서 띄운다(1~2분).
#   down    app 컨테이너 인스턴스를 DRAINING(태스크 정리) → ASG desired 0 → core 정지.
#   status  인스턴스·ECS 서비스 상태.
#
# 정지 중 남는 비용: ALB 공인 IPv4 2개, core EBS 30GB, Route53 존.
#
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
CLUSTER="gachamind"
ASG="gachamind-app"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

core_id() {
  aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:Name,Values=gachamind-ecs-host" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text
}

up() {
  local n="${1:-1}" core
  core="$(core_id)"
  echo "==> core $core 기동"
  aws ec2 start-instances --region "$REGION" --instance-ids "$core" >/dev/null
  echo "==> app ASG desired=$n"
  aws autoscaling set-desired-capacity --region "$REGION" --auto-scaling-group-name "$ASG" --desired-capacity "$n"
  echo "인스턴스가 클러스터에 등록되면 ECS 가 태스크를 띄운다. 진행은 'infra/env.sh status' 로."
}

down() {
  local core
  core="$(core_id)"

  # app 인스턴스를 먼저 DRAINING 으로 — ECS 가 태스크를 정상 종료(SIGTERM → 방 정리 콜백)시킨다.
  local arns
  arns=$(aws ecs list-container-instances --region "$REGION" --cluster "$CLUSTER" --filter 'attribute:role == app' \
    --query 'containerInstanceArns' --output text)
  if [ -n "$arns" ] && [ "$arns" != "None" ]; then
    echo "==> app 컨테이너 인스턴스 DRAINING"
    # shellcheck disable=SC2086
    aws ecs update-container-instances-state --region "$REGION" --cluster "$CLUSTER" --status DRAINING \
      --container-instances $arns >/dev/null
    for _ in $(seq 1 12); do
      # shellcheck disable=SC2086
      running=$(aws ecs describe-container-instances --region "$REGION" --cluster "$CLUSTER" --container-instances $arns \
        --query 'sum(containerInstances[].runningTasksCount)' --output text)
      [ "$running" = "0" ] && break
      echo "    태스크 ${running}개 정리 중…"; sleep 5
    done
  fi

  echo "==> app ASG desired=0"
  aws autoscaling set-desired-capacity --region "$REGION" --auto-scaling-group-name "$ASG" --desired-capacity 0
  echo "==> core $core 정지"
  aws ec2 stop-instances --region "$REGION" --instance-ids "$core" >/dev/null
}

status() {
  echo "── EC2"
  aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:Name,Values=gachamind-ecs-host,gachamind-app" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].{name:Tags[?Key==`Name`]|[0].Value,id:InstanceId,type:InstanceType,state:State.Name}' --output table
  echo "── ECS 컨테이너 인스턴스"
  local arns
  arns=$(aws ecs list-container-instances --region "$REGION" --cluster "$CLUSTER" --query 'containerInstanceArns' --output text)
  if [ -n "$arns" ] && [ "$arns" != "None" ]; then
    # shellcheck disable=SC2086
    aws ecs describe-container-instances --region "$REGION" --cluster "$CLUSTER" --container-instances $arns \
      --query 'containerInstances[].{ec2:ec2InstanceId,status:status,agent:agentConnected,tasks:runningTasksCount,role:attributes[?name==`role`]|[0].value}' --output table
  fi
  echo "── ECS 서비스 (desired/running)"
  local names
  names=$(aws ecs list-services --region "$REGION" --cluster "$CLUSTER" --query 'serviceArns[]' --output text | tr '\t' ' ')
  # shellcheck disable=SC2086
  aws ecs describe-services --region "$REGION" --cluster "$CLUSTER" --services $names \
    --query 'services[].{name:serviceName,desired:desiredCount,running:runningCount,rollout:deployments[0].rolloutState}' --output table
}

cmd="${1:-status}"; shift || true
case "$cmd" in
  up)     up "$@" ;;
  down)   down ;;
  status) status ;;
  *) echo "usage: $0 up [app 대수] | down | status" >&2; exit 1 ;;
esac
