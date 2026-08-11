import type { ReactNode } from "react";

interface Props {
  title: string;
  icon?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** XP 창 크롬. 타이틀바 버튼은 장식이라 동작하지 않는다 */
export function XpWindow({ title, icon, className, bodyClassName, children }: Props) {
  return (
    <div className={`xp-window ${className ?? ""}`}>
      <div className="xp-titlebar">
        {icon && <span aria-hidden>{icon}</span>}
        <span className="truncate">{title}</span>
        <div className="ml-auto flex gap-0.5" aria-hidden>
          <span className="xp-titlebar-button">–</span>
          <span className="xp-titlebar-button">□</span>
          <span className="xp-titlebar-button is-close">✕</span>
        </div>
      </div>
      <div className={bodyClassName ?? "p-3"}>{children}</div>
    </div>
  );
}
