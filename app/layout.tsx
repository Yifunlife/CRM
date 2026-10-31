import type { Metadata } from "next";
import "./globals.css";
import "./office.css";
import "./demo-integration.css";
import "./crm-density.css";

export const metadata: Metadata = {
  title: "亦玩客资管理",
  description: "统一客资，运营分配，业务跟进。",
  icons: {
    icon: "/yifun-favicon.png",
    shortcut: "/yifun-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
