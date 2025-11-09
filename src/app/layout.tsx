import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import { ToastProvider } from '@/lib/toast'
import { AppHeader } from '@/components/AppHeader'

export const metadata: Metadata = {
  title: 'Measurement System',
  description: 'Tap-only measurement web app for manufacturing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            <AppHeader />
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

