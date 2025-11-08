import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Chat - Powered by Custom Fine-Tuned Model",
  description: "Chat with an AI trained on custom content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiasedn h-full bg-graident-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900`}
        suppressHydrationWarning={true}
      >
        {children}
      </body>
    </html>
  );
}
