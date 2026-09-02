import { useLayoutEffect, useRef } from 'react';

interface NouseBridge {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}
const nouse: NouseBridge | undefined = (window as { nouse?: NouseBridge }).nouse;

export function TitleBar() {
  return (
    <div className="titlebar">
      <div className="brandmark">
        <div className="mark" />
        <div>
          <div className="bname">Nouse Explorer</div>
          <div className="bsub">Model Intelligence</div>
        </div>
      </div>
      <span className="tb-spacer" />
      {nouse && (
        <>
          <button type="button" className="tbtn" aria-label="Minimize" onClick={() => nouse.minimize()}>–</button>
          <button type="button" className="tbtn" aria-label="Maximize" onClick={() => nouse.maximize()}>▢</button>
          <button type="button" className="tbtn close" aria-label="Close" onClick={() => nouse.close()}>✕</button>
        </>
      )}
    </div>
  );
}

/** Keeps a ref's measured width/height in a callback (for the sliding pill). */
export function useMeasure<T extends HTMLElement>(
  onMeasure: (el: T) => void,
): React.RefObject<T> {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (ref.current) onMeasure(ref.current);
  });
  return ref;
}
