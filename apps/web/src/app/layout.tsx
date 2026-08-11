import type { Metadata } from "next";
import "./globals.css";

// XP 감성을 위해 시스템 폰트 Tahoma를 쓴다. 웹폰트를 받아오지 않는다
export const metadata: Metadata = {
  title: "gachaMind",
  description: "가챠마인드 by KingoDuo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
