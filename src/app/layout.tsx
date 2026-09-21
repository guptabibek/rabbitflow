import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

function getMetadataBase() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

  if (configuredUrl) {
    try {
      return new URL(configuredUrl);
    } catch {
      // Keep local and review builds usable when an environment has a malformed URL.
    }
  }

  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
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
    icon: [{ url: "/brand/rabbitflow-mark.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "RabbitFlow - Agile Project Management",
    description:
      "Boards, backlog, sprint capacity, labels, and role-aware project management.",
    type: "website",
    images: [
      {
        url: "/brand/rabbitflow-social-card.png",
        width: 1200,
        height: 630,
        alt: "RabbitFlow",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RabbitFlow - Agile Project Management",
    description: "Boards, backlog, sprint capacity, labels, and role-aware project management.",
    images: ["/brand/rabbitflow-social-card.png"],
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
          {/*
            richColors is deliberately off: it paints the whole toast in the
            status colour, which turns a failed save into the loudest thing on
            a dense board. The tone is carried by the icon and the border
            instead — see components/ui/sonner.tsx.
          */}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
