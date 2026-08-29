import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/** Object URL for a project file, fetched once per path. */
export function useFileUrl(relPath: string | undefined): string | undefined {
  const client = useStore((s) => s.client);
  const [url, setUrl] = useState<string | undefined>(() =>
    relPath ? cache.get(relPath) : undefined,
  );

  useEffect(() => {
    if (!relPath || !client) return;
    const hit = cache.get(relPath);
    if (hit) {
      setUrl(hit);
      return;
    }
    let cancelled = false;
    let pending = inflight.get(relPath);
    if (!pending) {
      pending = client
        .download(relPath)
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          cache.set(relPath, objectUrl);
          inflight.delete(relPath);
          return objectUrl;
        })
        .catch((err) => {
          inflight.delete(relPath);
          throw err;
        });
      inflight.set(relPath, pending);
    }
    pending
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [client, relPath]);

  return url;
}
