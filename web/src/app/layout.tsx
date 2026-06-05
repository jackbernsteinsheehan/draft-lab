import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UserMenu from "./UserMenu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "draft-lab",
  description: "Mock draft engine and analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-30 backdrop-blur bg-background/80 border-b border-border">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block size-2.5 rounded-full bg-blue-500" />
              draft-lab
            </a>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/draft" label="Draft" />
              <NavLink href="/analyze" label="Analyze" />
              <div className="pl-2 ml-1 border-l border-border">
                <UserMenu />
              </div>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="px-3 py-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
    >
      {label}
    </a>
  );
}
