import { randomUUID } from "node:crypto";
import { assignRoom } from "@/lib/room-registry";

export async function POST() {
  const roomId = randomUUID().slice(0, 8);
  const port = assignRoom(roomId);
  return Response.json({ roomId, port });
}
