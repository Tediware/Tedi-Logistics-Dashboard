import type { Metadata } from "next"
import { Geist, Geist_Mono, Manrope } from "next/font/google"

import "./globals.css"
import { AppNav } from "@/components/app-nav"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { site } from "@/lib/site"
import { cn } from "@/lib/utils"

const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" })
const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: site.name,
  description: site.description,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        manrope.variable,
        geistHeading.variable
      )}
    >
      <body>
        <ThemeProvider>
          <AppNav />
          <main className="mx-auto max-w-5xl px-6 py-8 has-data-full-width:max-w-none has-data-full-width:py-4">
            {children}
          </main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
