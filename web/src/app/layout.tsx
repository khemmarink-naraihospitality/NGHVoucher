import type { Metadata } from "next";
import { agrandir } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lub d Room Voucher Generator",
  description: "Issue, approve, and export Lub d complimentary room vouchers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${agrandir.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
