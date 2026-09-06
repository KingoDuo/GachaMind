#!/usr/bin/env bash
#
# gachaMind AWS 환경 켜고 끄기. 인스턴스는 두 부류다(infra/terraform/ec2.tf).
#   core  한 대 고정(aws_instance). redis/postgres/rabbitmq. 끌 때는 EC2 를 정지한다(디스크의 Postgres 데이터는 남는다).
#   app   ASG. web/matchmaking/user/worker/game-session 샤드. 대수는 ECS capacity provider 가 태스크 배치 필요에 따라
#         자동으로 정한다(0~max). 그래서 켜고 끄기는 "max 를 원래대로/0 으로" 바꾸는 것이다.
#
# 사용법: infra/env.sh up [max=4] | down | status
#   up      core 기동 → app ASG max 복구. 태스크 6개가 놓일 자리가 없으니 ECS 가 인스턴스를 띄운다(2~3분).
#   down    app ASG max=0 → ASG 가 인스턴스를 끄고, managed draining 이 그 위의 태스크를 정상 종료시킨다 → core 정지.
#   status  인스턴스·ECS 서비스 상태.
#
# 정지 중 남는 비용: ALB 공인 IPv4 2개, core EBS 30GB, Route53 존.
#
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
CLUSTER="gachamind"
ASG="gachamind-app"
APP_MAX_DEFAULT=4 # infra/terraform/variables.tf 의 app_instance_max 와 같게

core_id() {
  aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:Name,Values=gachamind-ecs-host" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text
}

asg_instances() {
  aws autoscaling describe-auto-scaling-groups --region "$REGION" --auto-scaling-group-names "$ASG" \
    --query 'length(AutoScalingGroups[0].Instances)' --output text
}

up() {
  local max="${1:-$APP_MAX_DEFAULT}" core
  core="$(core_id)"
  echo "==> core $core 기동"
  aws ec2 start-instances --region "$REGION" --instance-ids "$core" >/dev/null
  echo "==> app ASG max=$max (대수는 ECS 가 정한다)"
  aws autoscaling update-auto-scaling-group --region "$REGION" --auto-scaling-group-name "$ASG" --max-size "$max"
  echo "태스크 배치 필요를 보고 ECS 가 인스턴스를 띄운다. 진행은 'infra/env.sh status' 로."
}

down() {
  local core
  core="$(core_id)"

  # max 0 → desired 도 0 으로 내려가고 ASG 가 인스턴스를 끈다. capacity provider 의 managed draining 이
  # 끄기 전에 태스크를 정상 종료(SIGTERM → 방 정리 콜백)시키므로, core 는 그동안 살아 있어야 한다.
  echo "==> app ASG max=0"
  aws autoscaling update-auto-scaling-group --region "$REGION" --auto-scaling-group-name "$ASG" --min-size 0 --max-size 0
  for _ in $(seq 1 36); do
    n=$(asg_instances)
    [ "$n" = "0" ] && break
    echo "    app 인스턴스 ${n}대 정리 중…"; sleep 10
  done

  echo "==> core $core 정지"
  aws ec2 stop-instances --region "$REGION" --instance-ids "$core" >/dev/null
}

status() {
  echo "── EC2"
  aws ec2 describe-instances --region "$REGION" \
    --filters "Name=tag:Name,Values=gachamind-ecs-host,gachamind-app" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].{name:Tags[?Key==`Name`]|[0].Value,id:InstanceId,type:InstanceType,state:State.Name}' --output table
  echo "── app ASG"
  aws autoscaling describe-auto-scaling-groups --region "$REGION" --auto-scaling-group-names "$ASG" \
    --query 'AutoScalingGroups[0].{min:MinSize,max:MaxSize,desired:DesiredCapacity,instances:length(Instances)}' --output table
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
  *) echo "usage: $0 up [app max] | down | status" >&2; exit 1 ;;
esac
