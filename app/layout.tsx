import type { Metadata } from "next";
import "./globals.css";
import { DbInit } from "@/components/db-init";

export const metadata: Metadata = {
  title: "캘린더",
  description: "드래그로 기간 할일을 등록하는 먼슬리 캘린더",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <DbInit />
        {children}
      </body>
    </html>
  );
}
