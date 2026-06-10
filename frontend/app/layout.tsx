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
  title: "Jiarui Online Study Platform",
  description: "Book exam-prep",
  icons: {
    icon: "/jiarui.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const year = new Date().getFullYear();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="site-footer">
          <span>&copy; {year} Jiarui Education</span>
          <span aria-hidden="true">·</span>
          <span className="site-footer-credit">
            by{" "}
            <a
              className="site-footer-mark"
              href="https://oliver-huang.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Designed by Oliver Huang"
              title="Designed by Oliver Huang"
            >
              OH
            </a>
          </span>
        </footer>
      </body>
    </html>
  );
}
