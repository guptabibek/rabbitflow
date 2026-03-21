import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

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
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-4 focus:left-4 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring">
          Skip to main content
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          storageKey="rabbitflow-theme"
        >
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
