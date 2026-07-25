import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import "./design.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

/* Browser tab and search results carry the descriptive title. Link previews get
   the short one — iMessage and Slack give it two lines before truncating, so
   the value proposition has to land before the category does. */
const TITLE = "Cue — client agreements for photographers and videographers";
const DESCRIPTION =
  "Create a polished client agreement, send a secure signing link, and keep the signed copy in one place.";

const SHARE_TITLE = "Get the agreement out of the way.";
const SHARE_DESCRIPTION =
  "Client agreements for photographers and videographers. Send it, get it signed, keep the record.";

/* Must reflect where this instance is actually served. Hardcoding the
   production domain made staging advertise a hostname with no DNS record, so
   every shared staging link previewed as an address that resolves nowhere. */
const SITE_URL = process.env.PUBLIC_URL ?? "https://cue.krevo.io";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Cue",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
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
