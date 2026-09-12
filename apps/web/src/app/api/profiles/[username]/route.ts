import { failureResponse, findProfile } from "@/features/profile/server";

/** 프로필(계정 + 누적 전적) → user 서비스 위임. 누구나 볼 수 있어 세션을 요구하지 않는다. */
export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await findProfile(username);
  if (!profile.ok) return failureResponse(profile.reason);
  return Response.json(profile.data);
}
