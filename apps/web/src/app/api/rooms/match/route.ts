import { randomUUID } from "node:crypto";
import type { RoomAssignment } from "@gachamind/shared";
import { assignRoom } from "@/lib/room-registry";
import { pickJoinableRoom } from "@/lib/room-matching";

export async function POST() {
  const matched = await pickJoinableRoom();
  if (matched) return Response.json(matched satisfies RoomAssignment);

  const roomId = randomUUID().slice(0, 8);
  const port = assignRoom(roomId);
  return Response.json({ roomId, port } satisfies RoomAssignment);
}
