import { useState, useEffect } from 'react';

/**
 * Re-renders on an interval and returns the current epoch ms — for live
 * countdowns/clocks. Shared by the SLA radiator, SLA board, and anywhere else
 * that needs a ticking "now".
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
