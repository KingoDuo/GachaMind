import { proxyCredentials } from "@/features/auth/server";
import type { NextRequest } from "next/server";

/** 가입 → user 서비스 위임. 성공 시 세션 쿠키를 심는다. */
export function POST(request: NextRequest) {
  return proxyCredentials(request, "/auth/signup");
}
