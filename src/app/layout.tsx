import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import "./design.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const TITLE = "Cue — client agreements for photographers and videographers";
const DESCRIPTION =
  "Create a polished client agreement, send a secure signing link, and keep the signed copy in one place.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cue.krevo.io"),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://cue.krevo.io",
    siteName: "Cue",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: "Send the Cue. Get the yes. Keep the record.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable}`}>
      <body className="cue">{children}</body>
    </html>
  );
}
