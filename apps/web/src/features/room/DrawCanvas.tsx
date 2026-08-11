"use client";

import type { Point, StrokeSegment } from "@gachamind/shared";
import { useEffect, useRef, useState } from "react";
import type { DrawChannel } from "./useRoomSocket";

const COLORS = ["#171717", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ffffff"];
const WIDTHS = [3, 8, 18];

interface Props {
  channel: DrawChannel;
  canDraw: boolean;
  onStroke: (stroke: StrokeSegment) => void;
  onClear: () => void;
}

function paintSegment(
  ctx: CanvasRenderingContext2D,
  segment: StrokeSegment,
  width: number,
  height: number,
): void {
  const { points, color } = segment;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = segment.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x * width, points[0].y * height, segment.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x * width, points[0].y * height);
  for (const point of points.slice(1)) ctx.lineTo(point.x * width, point.y * height);
  ctx.stroke();
}

export function DrawCanvas({ channel, canDraw, onStroke, onClear }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);

  // 포인터 입력은 프레임 단위로 모아서 보낸다. pointermove마다 보내면 패킷이 과도해진다.
  const bufferRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);
  // rAF 루프가 색/굵기 변경 때마다 재시작하지 않도록 ref로 들고 있는다.
  const styleRef = useRef({ color, width });

  useEffect(() => {
    styleRef.current = { color, width };
  }, [color, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function repaintAll() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, rect.width, rect.height);
      for (const segment of channel.getStrokes()) {
        paintSegment(ctx!, segment, rect.width, rect.height);
      }
    }

    repaintAll();

    const unsubscribe = channel.subscribe((event) => {
      const rect = canvas.getBoundingClientRect();
      if (event.type === "stroke") {
        paintSegment(ctx, event.stroke, rect.width, rect.height);
      } else {
        repaintAll();
      }
    });

    const observer = new ResizeObserver(repaintAll);
    observer.observe(canvas);

    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, [channel]);

  useEffect(() => {
    if (!canDraw) return;
    let frame = 0;

    function flush() {
      frame = requestAnimationFrame(flush);
      const buffer = bufferRef.current;
      if (buffer.length < 2) return;

      const segment: StrokeSegment = { points: buffer, ...styleRef.current };
      // 다음 묶음이 이어지도록 마지막 점을 남긴다.
      bufferRef.current = [buffer[buffer.length - 1]];

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const rect = canvas.getBoundingClientRect();
        paintSegment(ctx, segment, rect.width, rect.height);
      }
      onStroke(segment);
    }

    frame = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(frame);
  }, [canDraw, onStroke]);

  function toNormalized(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    bufferRef.current = [toNormalized(event)];
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw || !drawingRef.current) return;
    bufferRef.current.push(toNormalized(event));
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    bufferRef.current = [];
  }

  return (
    <div className="flex flex-col gap-1">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`xp-sunken aspect-4/3 w-full touch-none ${
          canDraw ? "cursor-crosshair" : "cursor-default"
        }`}
      />

      {/* 그림판 흉내 도구 모음. 출제자에게만 보인다 */}
      {canDraw && (
        <div className="xp-panel flex flex-wrap items-center gap-3 p-1.5">
          <div className="flex gap-0.5">
            {COLORS.map((option) => (
              <button
                key={option}
                onClick={() => setColor(option)}
                aria-label={`색상 ${option}`}
                className={`p-0.5 ${color === option ? "bg-[#316ac5]" : ""}`}
              >
                <span
                  className="block h-5 w-5 border border-[#85837a]"
                  style={{ background: option }}
                />
              </button>
            ))}
          </div>

          <div className="flex gap-0.5">
            {WIDTHS.map((option) => (
              <button
                key={option}
                onClick={() => setWidth(option)}
                aria-label={`굵기 ${option}`}
                className={`flex h-6 w-6 items-center justify-center border ${
                  width === option
                    ? "border-[#85837a] bg-[#d8d4c8] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.25)]"
                    : "border-transparent hover:border-[#85837a]"
                }`}
              >
                <span
                  className="rounded-full bg-black"
                  style={{ width: option, height: option }}
                />
              </button>
            ))}
          </div>

          <button onClick={onClear} className="xp-button ml-auto px-3 py-1 text-xs">
            모두 지우기
          </button>
        </div>
      )}
    </div>
  );
}
