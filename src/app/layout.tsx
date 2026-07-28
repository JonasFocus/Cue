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
  "Send the Cue. Get the yes. Keep the record. Client agreements for photographers and videographers.";

const SHARE_TITLE = "Send the Cue. Get the yes.";
const SHARE_DESCRIPTION =
  "Client agreements for photographers and videographers. Send the Cue, get the yes, keep the record.";

import { SITE_URL } from "@/lib/site-url";

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
  /* "summary", not "summary_large_image": paired with the square OG image this
     keeps a shared link to a compact strip instead of a full-bleed hero card. */
  twitter: {
    card: "summary",
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
