import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "한자랑 | 200자 한자 학습",
    template: "%s | 한자랑",
  },
  description:
    "7급·준6급·6급 배정한자 200자를 짝맞추기와 4지선다로 익히는 초등 한자 학습 앱",
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
