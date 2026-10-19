import React, { createContext, useContext, useEffect, useState } from 'react';
import { posts } from './content.js';
import { normalizeFeed } from './feed-data.js';

const FeedContext = createContext(posts);
export const useInstagramFeed = () => useContext(FeedContext);

export function InstagramFeedProvider({ children }) {
  const [feed, setFeed] = useState(posts);
  useEffect(() => {
    let stopped = false, busy = false, pending;
    const refresh = async () => {
      if (stopped || busy || document.hidden) return;
      busy = true;
      const controller = new AbortController();
      pending = controller;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/instagram', { signal: controller.signal });
        if (!response.ok) return;
        const next = normalizeFeed(await response.json());
        if (!stopped && next.length) setFeed(next);
      } catch { /* Initial local photos/last successful feed remain available. */ }
      finally { clearTimeout(timeout); busy = false; }
    };
    refresh(); // Hero needs newest photos immediately; gallery embeds stay lazy.
    const interval = setInterval(refresh, 300000);
    document.addEventListener('visibilitychange', refresh);
    return () => { stopped = true; pending?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>;
}
