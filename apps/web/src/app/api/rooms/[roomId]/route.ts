import { getRoomPort, releaseRoom } from "@/lib/room-registry";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const port = getRoomPort(roomId);
  if (port === undefined) {
    return Response.json({ error: "room not found" }, { status: 404 });
  }
  return Response.json({ roomId, port });
}

/** game-room-server가 방이 비어서 정리했을 때 호출하는 콜백. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  releaseRoom(roomId);
  return new Response(null, { status: 204 });
}
