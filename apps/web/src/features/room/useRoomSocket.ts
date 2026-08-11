"use client";

import type {
  ClientToServerMessage,
  GamePhase,
  PlayerSummary,
  ServerToClientMessage,
  StrokeSegment,
} from "@gachamind/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RoomConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "not-found"
  | "room-full";

export interface FeedEntry {
  kind: "chat" | "system" | "correct";
  nickname?: string;
  text: string;
  at: number;
}

export interface GameState {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  drawerNickname: string | null;
  roundEndsAt: number | null;
  wordLength: number | null;
  /** 출제자 본인에게만 채워진다. */
  word: string | null;
  /** 이번 라운드에 정답을 맞힌 사람. */
  solvedIds: string[];
  /** 라운드가 끝나고 공개된 제시어. */
  revealedWord: string | null;
}

type DrawEvent =
  | { type: "stroke"; stroke: StrokeSegment }
  | { type: "clear" }
  | { type: "reset"; strokes: StrokeSegment[] };

/**
 * 캔버스 전용 이벤트 채널.
 * 그리기 좌표는 초당 수십 건이 오가므로 React 상태로 올리지 않고 캔버스만 직접 구독하게 한다.
 */
export interface DrawChannel {
  getStrokes(): StrokeSegment[];
  subscribe(listener: (event: DrawEvent) => void): () => void;
}

const INITIAL_GAME: GameState = {
  phase: "waiting",
  round: 0,
  totalRounds: 0,
  drawerId: null,
  drawerNickname: null,
  roundEndsAt: null,
  wordLength: null,
  word: null,
  solvedIds: [],
  revealedWord: null,
};

/** 피드가 무한히 길어지지 않도록 최근 것만 남긴다. */
const MAX_FEED_ENTRIES = 200;

export function useRoomSocket(roomId: string, nickname: string) {
  const [status, setStatus] = useState<RoomConnectionStatus>("connecting");
  const [me, setMe] = useState<PlayerSummary | null>(null);
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [game, setGame] = useState<GameState>(INITIAL_GAME);

  const socketRef = useRef<WebSocket | null>(null);
  const strokesRef = useRef<StrokeSegment[]>([]);
  const listenersRef = useRef(new Set<(event: DrawEvent) => void>());

  const emit = useCallback((event: DrawEvent) => {
    for (const listener of listenersRef.current) listener(event);
  }, []);

  const pushFeed = useCallback((entry: FeedEntry) => {
    setFeed((prev) => [...prev, entry].slice(-MAX_FEED_ENTRIES));
  }, []);

  const drawChannel = useMemo<DrawChannel>(
    () => ({
      getStrokes: () => strokesRef.current,
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    }),
    [],
  );

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

        switch (message.type) {
          case "room-state":
            setMe(message.you);
            setPlayers(message.players);
            setGame({
              phase: message.phase,
              round: message.round,
              totalRounds: message.totalRounds,
              drawerId: message.drawerId,
              drawerNickname:
                message.players.find((p) => p.id === message.drawerId)?.nickname ?? null,
              roundEndsAt: message.roundEndsAt,
              wordLength: message.wordLength,
              word: null,
              solvedIds: [],
              revealedWord: null,
            });
            strokesRef.current = message.strokes;
            emit({ type: "reset", strokes: message.strokes });
            break;

          case "player-joined":
            setPlayers((prev) =>
              prev.some((p) => p.id === message.player.id) ? prev : [...prev, message.player],
            );
            break;

          case "player-left":
            setPlayers((prev) => prev.filter((p) => p.id !== message.playerId));
            break;

          case "room-full":
            setStatus("room-full");
            break;

          case "chat":
            pushFeed({
              kind: "chat",
              nickname: message.nickname,
              text: message.text,
              at: message.at,
            });
            break;

          case "system":
            pushFeed({ kind: "system", text: message.text, at: message.at });
            break;

          case "draw":
            strokesRef.current = [...strokesRef.current, message.stroke];
            emit({ type: "stroke", stroke: message.stroke });
            break;

          case "draw-clear":
            strokesRef.current = [];
            emit({ type: "clear" });
            break;

          case "game-started":
            setGame((prev) => ({
              ...prev,
              phase: "playing",
              totalRounds: message.totalRounds,
              revealedWord: null,
            }));
            break;

          case "round-started":
            setGame((prev) => ({
              ...prev,
              phase: "playing",
              round: message.round,
              totalRounds: message.totalRounds,
              drawerId: message.drawerId,
              drawerNickname: message.drawerNickname,
              roundEndsAt: message.roundEndsAt,
              wordLength: message.wordLength,
              word: message.word ?? null,
              solvedIds: [],
              revealedWord: null,
            }));
            break;

          case "correct-answer":
            setPlayers(message.players);
            setGame((prev) => ({ ...prev, solvedIds: [...prev.solvedIds, message.playerId] }));
            pushFeed({
              kind: "correct",
              nickname: message.nickname,
              text: `${message.nickname}님이 정답을 맞혔습니다.`,
              at: Date.now(),
            });
            break;

          case "round-ended":
            setPlayers(message.players);
            setGame((prev) => ({
              ...prev,
              drawerId: null,
              drawerNickname: null,
              roundEndsAt: null,
              word: null,
              revealedWord: message.word,
            }));
            pushFeed({
              kind: "system",
              text: `${message.round}라운드 종료. 정답은 "${message.word}"였습니다.`,
              at: Date.now(),
            });
            break;

          case "game-ended":
            setPlayers(message.players);
            setGame((prev) => ({ ...prev, phase: "ended", drawerId: null, roundEndsAt: null }));
            pushFeed({ kind: "system", text: "게임이 종료되었습니다.", at: Date.now() });
            break;
        }
      };

      socket.onclose = () => setStatus("disconnected");
    }

    connect();

    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [roomId, nickname, emit, pushFeed]);

  const send = useCallback((message: ClientToServerMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const sendChat = useCallback((text: string) => send({ type: "chat", text }), [send]);
  const sendStartGame = useCallback(() => send({ type: "start-game" }), [send]);

  const sendStroke = useCallback(
    (stroke: StrokeSegment) => {
      strokesRef.current = [...strokesRef.current, stroke];
      send({ type: "draw", stroke });
    },
    [send],
  );

  const sendClear = useCallback(() => {
    strokesRef.current = [];
    emit({ type: "clear" });
    send({ type: "draw-clear" });
  }, [send, emit]);

  const isDrawer = Boolean(me && game.drawerId === me.id);

  return {
    status,
    me,
    players,
    feed,
    game,
    isDrawer,
    drawChannel,
    sendChat,
    sendStartGame,
    sendStroke,
    sendClear,
  };
}
