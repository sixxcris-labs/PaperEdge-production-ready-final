import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperEdge Workspace",
  description: "Redirect entrypoint for the PaperEdge dashboard app.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
