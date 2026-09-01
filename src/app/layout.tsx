import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Definition Capture",
  description: "A personal glossary for terms and concepts worth remembering.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
