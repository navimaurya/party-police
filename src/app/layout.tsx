import type { Metadata } from "next";
import { GeistSans } from "geist/font";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/fredoka";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Fonts are self-hosted from npm packages, so builds never depend on Google Fonts being reachable.

export const metadata: Metadata = {
  title: { default: "Party Police 🚨", template: "%s · Party Police 🚨" },
  description: "Nobody escapes the Party Committee! Track parties, party debts and who owes everyone a treat.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
