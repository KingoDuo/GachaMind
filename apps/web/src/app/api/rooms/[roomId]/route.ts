import { assignRoom } from "@/lib/room-registry";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  // 뼈대 단계: 방 존재 여부를 별도로 검증하지 않고, 없으면 새로 배정한다.
  const port = assignRoom(roomId);
  return Response.json({ roomId, port });
}
