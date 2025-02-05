'use client'; // Mark this file as a client component

import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';

// Create Emotion cache
const cache = createCache({ key: 'css', prepend: true });

export default function ClientCacheProvider({ children }) {
  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
    