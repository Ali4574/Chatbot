import ClientCacheProvider from './component/ClientCacheProvider';
import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Wrap the children with the client-side component */}
        <ClientCacheProvider>
          {children}
        </ClientCacheProvider>
      </body>
    </html>
  );
}
