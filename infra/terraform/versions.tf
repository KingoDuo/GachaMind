# Terraform 본체와 provider 버전 핀. 상태 파일은 S3에 둔다(로컬 파일은 분실하면 리소스가 고아가 된다).
# 버킷은 Terraform이 관리하지 않는다(닭-달걀). infra/deploy.sh 가 없으면 만든다.
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }

  backend "s3" {
    bucket       = "gachamind-tfstate-472227100986"
    key          = "gachamind/terraform.tfstate"
    region       = "ap-northeast-2"
    use_lockfile = true # DynamoDB 없이 S3 조건부 쓰기로 잠금
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "gachamind", ManagedBy = "terraform" }
  }
}
