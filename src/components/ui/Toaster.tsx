'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'white',
          border: '1px solid #e5e7eb',
          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
        },
        classNames: {
          success: 'border-green-200 bg-green-50',
          error: 'border-red-200 bg-red-50',
          warning: 'border-yellow-200 bg-yellow-50',
          info: 'border-blue-200 bg-blue-50',
        },
      }}
      closeButton
      richColors
    />
  );
}
