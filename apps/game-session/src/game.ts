import { randomUUID } from "node:crypto";
import {
  MAX_ROUNDS,
  MIN_PLAYERS_TO_START,
  ROUND_DURATION_MS,
  normalizeAnswer,
  type GameResultPlayer,
  type RoundStartedMessage,
} from "@gachamind/shared";
import { publishGameEvent } from "./events.js";
import { syncOccupancy } from "./occupancy.js";
import type { Player, Room } from "./room.js";
import { pickWord } from "./words.js";

/** 라운드 사이에 정답을 보여주는 시간. */
const ROUND_INTERMISSION_MS = 4_000;

/** 정답자가 받는 최소 점수. 남은 시간에 비례해 여기에 가산된다. */
const BASE_ANSWER_SCORE = 10;
const SPEED_BONUS_SCORE = 90;

/** 출제자가 정답자 한 명당 받는 점수. */
const DRAWER_SCORE_PER_SOLVER = 10;

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function startGame(room: Room): void {
  if (room.phase === "playing") return;
  if (room.size < MIN_PLAYERS_TO_START) {
    room.notice(`게임을 시작하려면 ${MIN_PLAYERS_TO_START}명 이상이 필요합니다.`);
    return;
  }

  for (const player of room.players.values()) player.score = 0;
  room.phase = "playing";
  room.gameId = randomUUID();
  room.round = 0;
  room.usedWords = [];
  room.totalRounds = Math.min(room.size, MAX_ROUNDS);
  room.drawerQueue = shuffle([...room.players.keys()]).slice(0, room.totalRounds);

  room.broadcast({ type: "game-started", totalRounds: room.totalRounds });
  // 로비 목록이 "게임 중"으로 바뀌는 시점. 하트비트(20초)를 기다리면 목록이 뒤늦게 따라온다.
  void syncOccupancy(room);
  startRound(room);
}

export function startRound(room: Room): void {
  room.clearRoundTimer();

  const drawerId = room.drawerQueue.shift();
  const drawer = drawerId ? room.players.get(drawerId) : undefined;
  if (!drawer) {
    endGame(room);
    return;
  }

  room.round += 1;
  room.drawerId = drawer.id;
  room.word = pickWord(room.usedWords);
  room.usedWords.push(room.word);
  room.roundEndsAt = Date.now() + ROUND_DURATION_MS;
  room.solvedPlayerIds.clear();
  room.clearStrokes();

  room.broadcast({ type: "draw-clear" });

  const started: RoundStartedMessage = {
    type: "round-started",
    round: room.round,
    totalRounds: room.totalRounds,
    drawerId: drawer.id,
    drawerNickname: drawer.nickname,
    remainingMs: room.remainingMs ?? ROUND_DURATION_MS,
    wordLength: room.word.length,
  };
  // 제시어 본문은 출제자에게만. 나머지는 글자 수만 받는다.
  room.broadcast(started, drawer.id);
  room.send(drawer.id, { ...started, word: room.word });

  room.roundTimer = setTimeout(() => endRound(room), ROUND_DURATION_MS);
}

export function endRound(room: Room): void {
  if (room.phase !== "playing") return;
  room.clearRoundTimer();

  const word = room.word ?? "";
  room.drawerId = null;
  room.word = null;
  room.roundEndsAt = null;

  room.broadcast({ type: "round-ended", round: room.round, word, players: room.summaries });

  // 방이 비었으면 다음 라운드를 예약하지 않는다.
  if (room.size === 0) return;

  room.roundTimer = setTimeout(() => {
    if (room.phase !== "playing") return;
    if (room.size < MIN_PLAYERS_TO_START || room.drawerQueue.length === 0) {
      endGame(room);
      return;
    }
    startRound(room);
  }, ROUND_INTERMISSION_MS);
}

/** 점수순 등수를 매긴다. 동점이면 같은 등수를 주고, 다음 등수는 인원수만큼 건너뛴다. */
function toResultPlayers(room: Room): GameResultPlayer[] {
  const sorted = room.summaries.sort((a, b) => b.score - a.score);

  let rank = 0;
  let previousScore: number | null = null;

  return sorted.map((player, index) => {
    if (previousScore === null || player.score !== previousScore) {
      rank = index + 1;
      previousScore = player.score;
    }
    return { playerId: player.id, nickname: player.nickname, score: player.score, rank };
  });
}

export function endGame(room: Room): void {
  // 호출 경로가 여러 개라, 이미 끝난 게임을 두 번 발행하지 않도록 여기서 한 번 더 막는다.
  if (room.phase !== "playing") return;
  room.clearRoundTimer();

  const gameId = room.gameId;
  const roundsPlayed = room.round;

  room.phase = "ended";
  room.gameId = null;
  room.drawerId = null;
  room.word = null;
  room.roundEndsAt = null;
  room.drawerQueue = [];
  room.broadcast({ type: "game-ended", players: room.summaries });
  void syncOccupancy(room);

  // 전적 영속화는 results-worker 몫이다. 발행만 하고 결과를 기다리지 않는다.
  if (gameId) {
    void publishGameEvent({
      type: "game-finished",
      gameId,
      roomId: room.id,
      finishedAt: new Date().toISOString(),
      roundsPlayed,
      players: toResultPlayers(room),
    });
  }
}

/**
 * 채팅을 정답 후보로 검사한다.
 * 정답이면 점수를 주고 true, 그 밖에 제시어가 새어나가는 발언이면 걸러내고 true를 반환한다.
 * false면 호출자가 평범한 채팅으로 브로드캐스트하면 된다.
 */
export function handleGuess(room: Room, player: Player, text: string): boolean {
  if (room.phase !== "playing" || !room.word) return false;

  const guess = normalizeAnswer(text);
  const answer = normalizeAnswer(room.word);
  const isGuesser = player.id !== room.drawerId && !room.solvedPlayerIds.has(player.id);

  if (isGuesser && guess === answer) {
    room.solvedPlayerIds.add(player.id);

    const speedRatio = (room.remainingMs ?? 0) / ROUND_DURATION_MS;
    player.score += BASE_ANSWER_SCORE + Math.round(SPEED_BONUS_SCORE * speedRatio);

    const drawer = room.drawerId ? room.players.get(room.drawerId) : undefined;
    if (drawer) drawer.score += DRAWER_SCORE_PER_SOLVER;

    room.broadcast({
      type: "correct-answer",
      playerId: player.id,
      nickname: player.nickname,
      players: room.summaries,
    });

    if (room.unsolvedGuesserCount === 0) endRound(room);
    return true;
  }

  // 출제자나 이미 맞힌 사람이 제시어를 말하면 정답이 새므로 브로드캐스트하지 않는다.
  if (guess.includes(answer)) return true;

  return false;
}

/** 출제자가 나가면 라운드를 더 진행할 수 없다. 인원이 모자라면 게임 자체를 끝낸다. */
export function handlePlayerLeftDuringGame(room: Room, leftPlayerId: string): void {
  if (room.phase !== "playing") return;

  if (room.size < MIN_PLAYERS_TO_START) {
    room.notice("인원이 부족해 게임을 종료합니다.");
    endGame(room);
    return;
  }

  if (room.drawerId === leftPlayerId) {
    room.notice("출제자가 나가 라운드를 종료합니다.");
    endRound(room);
    return;
  }

  // 남은 사람이 모두 정답을 맞힌 상태가 될 수 있다.
  if (room.unsolvedGuesserCount === 0) endRound(room);
}
