import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import { PwaRegistration } from "@/components/pwa-registration";
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
  title: {
    default: "Clube do Jogo",
    template: "%s · Clube do Jogo",
  },
  description: "Vote, jogue e compartilhe cada mês com o Clube do Jogo.",
  applicationName: "Clube do Jogo",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Clube do Jogo" },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-theme="original"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--background)] text-zinc-50 font-sans">
        <script id="theme-init" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('clube-do-jogo:theme');var c={original:'#08080a',zelda:'#09100c',aperture:'#e9eef0',nier:'#c9c3ad',crossing:'#b8dfc7'};if(c[t]){document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=c[t]}}catch(e){}` }} />
        <AppProvider>
          <AppShell>{children}</AppShell>
          <PwaRegistration />
        </AppProvider>
      </body>
    </html>
  );
}
