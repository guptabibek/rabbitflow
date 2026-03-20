import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "RabbitFlow - Agile Project Management",
  description:
    "Production-ready Agile project management with boards, backlog, sprints, capacity planning, labels, and RBAC.",
  keywords: [
    "Agile Project Management",
    "Sprint Planning",
    "Kanban",
    "Backlog",
    "Azure DevOps Boards",
    "Next.js",
  ],
  authors: [{ name: "RabbitFlow Team" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "RabbitFlow - Agile Project Management",
    description:
      "Boards, backlog, sprint capacity, labels, and role-aware project management.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
