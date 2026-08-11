"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedEntry } from "./useRoomSocket";

interface Props {
  feed: FeedEntry[];
  placeholder: string;
  onSend: (text: string) => void;
}

export function ChatPanel({ feed, placeholder, onSend }: Props) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [feed]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-1 pb-1 text-xs font-bold">대화</h2>

      <ul className="xp-sunken flex min-h-40 flex-1 flex-col overflow-y-auto px-1.5 py-1 text-xs">
        {feed.length === 0 ? (
          <li className="text-muted">아직 대화가 없습니다.</li>
        ) : (
          feed.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="py-0.5 leading-snug">
              {entry.kind === "chat" ? (
                <>
                  <span className="font-bold">{entry.nickname}</span>
                  <span className="text-muted">: </span>
                  <span>{entry.text}</span>
                </>
              ) : (
                <span className={entry.kind === "correct" ? "font-bold text-[#217821]" : "text-[#00007b]"}>
                  {entry.kind === "correct" ? "★ " : "» "}
                  {entry.text}
                </span>
              )}
            </li>
          ))
        )}
        <div ref={bottomRef} />
      </ul>

      <form onSubmit={handleSubmit} className="mt-1 flex gap-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="xp-input min-w-0 flex-1"
        />
        <button type="submit" disabled={!text.trim()} className="xp-button px-3">
          보내기
        </button>
      </form>
    </section>
  );
}
