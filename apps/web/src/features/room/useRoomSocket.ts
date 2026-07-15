"use client";

import type { ClientToServerMessage, ServerToClientMessage } from "@gachamind/shared";
import { useEffect, useRef, useState } from "react";

export type RoomConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "not-found"
  | "room-full";

export function useRoomSocket(roomId: string, nickname: string) {
  const [playerCount, setPlayerCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState<RoomConnectionStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (res.status === 404) {
        if (!cancelled) setStatus("not-found");
        return;
      }
      const { port } = await res.json();
      if (cancelled) return;

      const socket = new WebSocket(`ws://${window.location.hostname}:${port}`);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus("connected");
        const join: ClientToServerMessage = { type: "join", roomId, nickname };
        socket.send(JSON.stringify(join));
      };

      socket.onmessage = (event) => {
        const message: ServerToClientMessage = JSON.parse(event.data);
        if (message.type === "room-full") {
          setStatus("room-full");
          return;
        }
        setPlayerCount(message.playerCount);
        if (message.type === "player-joined") {
          setLog((prev) => [...prev, `${message.nickname} 입장`]);
        } else if (message.type === "player-left") {
          setLog((prev) => [...prev, "플레이어 퇴장"]);
        }
      };

      socket.onclose = () => setStatus("disconnected");
    }

    connect();

    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [roomId, nickname]);

  return { status, playerCount, log };
}
