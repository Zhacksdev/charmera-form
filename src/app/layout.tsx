import type { Metadata, Viewport } from "next";
import { Nunito, Sniglet } from "next/font/google";
import "./globals.css";

const sniglet = Sniglet({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["800"],
});

const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Charmera – Wear your memories",
  description: "Pesan Italian charm dan keychain custom dari fotomu sendiri.",
};

export const viewport: Viewport = {
  themeColor: "#FFF4E3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${sniglet.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
