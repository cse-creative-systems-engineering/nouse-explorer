import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $research } from '../lib/store';

/**
 * Background-research notification (user directive): while the queue drains,
 * the user is told that use-case recommendations / rankings may improve as
 * data arrives. Shows queue depth + a glow progress bar; fires a transient
 * "research updated" toast when a batch lands.
 */
export function ResearchBanner() {
  const r = useStore($research);
  const [toast, setToast] = useState(false);
  const prevDone = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (r.done > prevDone.current && prevDone.current > 0) {
      setToast(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(false), 3200);
    }
    if (r.done > prevDone.current) prevDone.current = r.done;
  }, [r.done]);

  const active = r.running || r.pending > 0;
  const total = r.done + r.pending + r.failed;

  return (
    <>
      {active && (
        <div className="research-banner" role="status" aria-live="polite">
          <span className="rb-pulse" aria-hidden="true" />
          <span className="rb-text">
            <strong>Background research in progress</strong> — {r.pending} models
            remaining. Use-case recommendations and category rankings may improve as
            data arrives.
          </span>
          <span className="rb-count">
            {r.done}/{total || r.pending} researched
          </span>
          <div className="rb-bar" aria-hidden="true">
            <div
              className="rb-bar-fill"
              style={{ width: total > 0 ? `${Math.round((r.done / total) * 100)}%` : '4%' }}
            />
          </div>
        </div>
      )}
      {toast && (
        <div className="rb-toast" role="status">
          ✦ Research updated — rankings refreshed
        </div>
      )}
    </>
  );
}
