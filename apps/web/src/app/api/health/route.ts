/** 로드밸런서·모니터링용 헬스체크. 페이지 렌더 없이 프로세스 생존만 답한다. */
export function GET() {
  return Response.json({ status: "ok", service: "web" });
}
