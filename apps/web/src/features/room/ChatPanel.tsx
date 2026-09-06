"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedEntry } from "./useRoomSocket";

interface Props {
  feed: FeedEntry[];
  placeholder: string;
  onSend: (text: string) => void;
}

/** 이 안쪽(px)에 있으면 "바닥을 보고 있다"고 본다. 새 메시지가 오면 따라 내려간다. */
const STICK_TO_BOTTOM_THRESHOLD_PX = 24;

export function ChatPanel({ feed, placeholder, onSend }: Props) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  // 사용자가 옛 대화를 보려고 위로 올렸으면 새 메시지가 와도 끌어내리지 않는다.
  const stickToBottomRef = useRef(true);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    stickToBottomRef.current = distance <= STICK_TO_BOTTOM_THRESHOLD_PX;
  }

  // scrollIntoView는 페이지(window)까지 같이 움직이므로 목록 요소의 scrollTop만 만진다.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !stickToBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [feed]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <section className="flex flex-col">
      <h2 className="px-1 pb-1 text-xs font-bold">대화</h2>

      {/* 높이를 고정해서 메시지가 쌓여도 페이지가 길어지지 않고 목록 안에서만 스크롤된다 */}
      <ul
        ref={listRef}
        onScroll={handleScroll}
        className="xp-sunken flex h-72 flex-col overflow-y-auto px-1.5 py-1 text-xs"
      >
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
