"use client";

import { AuthError, login, logout, signup, useSession } from "@/features/auth/client";
import { clearNickname, MAX_NICKNAME_LENGTH, storeNickname } from "@/features/player/nickname";
import { XpWindow } from "@/features/ui/XpWindow";
import { MAX_PASSWORD_LENGTH, PASSWORD_PATTERN, USERNAME_PATTERN } from "@gachamind/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 입력 후 돌아갈 곳. 방 링크로 왔다가 닉네임이 없어 여기로 튕긴 경우 그 방으로 돌려보낸다.
 * useSearchParams를 쓰면 이 페이지가 통째로 서버 렌더에서 빠져 첫 화면이 비므로,
 * 버튼을 누른 시점에 주소창에서 직접 읽는다. 외부 주소로 나가지 않게 앱 내부 경로만 허용한다.
 */
function nextPath(): string {
  const requested = new URLSearchParams(window.location.search).get("next") ?? "";
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/lobby";
}

type Mode = "login" | "signup";

/** 서버로 보내기 전에 같은 규칙으로 한 번 거른다. 서버(user 서비스)가 최종 판정한다. */
function validateCredentials(mode: Mode, username: string, password: string, nickname: string) {
  if (!username) return "아이디를 입력하세요.";
  if (!USERNAME_PATTERN.test(username)) return "아이디는 영문, 숫자, 특수문자만 쓸 수 있습니다.";
  if (!password) return "비밀번호를 입력하세요.";
  if (password.length > MAX_PASSWORD_LENGTH) return `비밀번호는 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다.`;
  if (!PASSWORD_PATTERN.test(password)) return "비밀번호는 영문, 숫자, 특수문자만 쓸 수 있습니다.";
  if (mode === "signup" && !nickname.trim()) return "닉네임을 입력하세요.";
  return null;
}

export default function Home() {
  const router = useRouter();
  const session = useSession();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accountNickname, setAccountNickname] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [guestNickname, setGuestNickname] = useState("");

  function enter(nickname: string) {
    storeNickname(nickname);
    router.push(nextPath());
  }

  async function handleAuthSubmit(event: React.FormEvent) {
    event.preventDefault();
    const error = validateCredentials(mode, username, password, accountNickname);
    if (error) {
      setAuthError(error);
      return;
    }

    setAuthError(null);
    setPending(true);
    try {
      const user =
        mode === "signup"
          ? await signup(username, password, accountNickname.trim())
          : await login(username, password);
      enter(user.nickname);
    } catch (err) {
      setAuthError(err instanceof AuthError ? err.message : "요청을 처리하지 못했습니다.");
      setPending(false);
    }
  }

  function handleGuestSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = guestNickname.trim();
    if (!trimmed) return;
    enter(trimmed);
  }

  async function handleLogout() {
    await logout();
    clearNickname();
    // 세션 상태를 다시 읽는 가장 단순한 방법. 같은 페이지라 깜빡임도 거의 없다.
    window.location.reload();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <XpWindow title="gachaMind" icon="🎨" bodyClassName="flex flex-col gap-3 p-4">
        <div className="mb-1 flex items-center gap-3 border-b border-[#aca899] pb-3">
          <span className="text-3xl" aria-hidden>
            🖌️
          </span>
          <div>
            <h1 className="text-lg font-bold">가챠마인드</h1>
            <p className="text-xs text-muted">by KingoDuo</p>
          </div>
        </div>

        {/* 계정 영역. 세션 확인 전 → 확인 중 / 로그인됨 → 계속하기 / 아니면 → 로그인·가입 폼 */}
        {!session.ready ? (
          <p className="py-2 text-center text-xs text-muted">로그인 상태를 확인하는 중...</p>
        ) : session.user ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs">
              <span className="font-bold">{session.user.nickname}</span>님으로 로그인되어 있습니다.
              <span className="text-muted"> ({session.user.username})</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => enter(session.user!.nickname)}
                className="xp-button xp-button-default flex-1"
              >
                계속하기
              </button>
              <button onClick={handleLogout} className="xp-button">
                로그아웃
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAuthSubmit} className="flex flex-col gap-2">
            <div className="flex gap-1 text-xs" role="tablist">
              {(["login", "signup"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={mode === option}
                  onClick={() => {
                    setMode(option);
                    setAuthError(null);
                  }}
                  className={`xp-button flex-1 py-1 ${mode === option ? "xp-button-default" : ""}`}
                >
                  {option === "login" ? "로그인" : "가입"}
                </button>
              ))}
            </div>

            <label className="text-xs font-bold" htmlFor="username">
              아이디
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              className="xp-input w-full"
            />

            <label className="text-xs font-bold" htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="xp-input w-full"
            />

            {mode === "signup" && (
              <>
                <label className="text-xs font-bold" htmlFor="account-nickname">
                  닉네임 <span className="font-normal text-muted">(게임에서 보이는 이름)</span>
                </label>
                <input
                  id="account-nickname"
                  value={accountNickname}
                  onChange={(e) => setAccountNickname(e.target.value)}
                  maxLength={MAX_NICKNAME_LENGTH}
                  className="xp-input w-full"
                />
              </>
            )}

            {authError && (
              <p className="border border-[#aca899] bg-[#ffffe1] px-2 py-1 text-xs text-red-700">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="xp-button xp-button-default mt-1"
            >
              {pending ? "처리 중..." : mode === "signup" ? "가입하고 시작" : "로그인"}
            </button>
          </form>
        )}

        <div className="my-1 flex items-center gap-3 text-xs text-muted">
          <span className="h-0.5 flex-1 border-t border-b border-t-[#aca899] border-b-white" />
          또는 게스트로 플레이
          <span className="h-0.5 flex-1 border-t border-b border-t-[#aca899] border-b-white" />
        </div>

        <form onSubmit={handleGuestSubmit} className="flex flex-col gap-2">
          <label className="text-xs font-bold" htmlFor="nickname">
            닉네임
          </label>
          <div className="flex gap-2">
            <input
              id="nickname"
              placeholder="닉네임을 입력하세요"
              value={guestNickname}
              onChange={(e) => setGuestNickname(e.target.value)}
              maxLength={MAX_NICKNAME_LENGTH}
              className="xp-input min-w-0 flex-1"
            />
            <button type="submit" disabled={!guestNickname.trim()} className="xp-button shrink-0">
              게스트로 플레이
            </button>
          </div>
          <p className="text-xs text-muted">
            게스트는 가입 없이 바로 플레이할 수 있습니다. 닉네임은 이 탭에서만 유지되고 전적은 남지 않습니다.
          </p>
        </form>
      </XpWindow>
    </main>
  );
}
