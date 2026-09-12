"use client";

import { useSession } from "@/features/auth/client";
import { XpWindow } from "@/features/ui/XpWindow";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** /profile = 내 프로필. 세션에서 아이디를 알아내 /profile/{아이디} 로 보낸다. 게스트는 입구로. */
export default function MyProfilePage() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (!session.ready) return;
    router.replace(session.user ? `/profile/${encodeURIComponent(session.user.username)}` : "/?next=/profile");
  }, [session, router]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-10">
      <XpWindow title="가챠마인드 - 프로필" icon="👤" bodyClassName="p-8">
        <p className="text-center text-xs text-muted">프로필을 여는 중...</p>
      </XpWindow>
    </main>
  );
}
