import '../globals.css';
import { Toaster } from '@/components/ui/Toaster';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
