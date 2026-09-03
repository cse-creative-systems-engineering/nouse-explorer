/**
 * BackgroundArt — fixed full-bleed artwork sitting at the document root.
 * Toned down (opacity, blur, slight desat) so the art reads as room
 * lighting, not wallpaper. Palette is preserved — same cobalt as the
 * source engraving, just at a respectful volume.
 *
 * Swap `src` to rotate the etching (sandbox / tasks / memory / browse).
 */
export function BackgroundArt({
  src,
  credit,
}: {
  src: string;
  credit?: string;
}) {
  return (
    <div className="art-bg" aria-hidden>
      <img src={src} alt="" />
      <div className="art-bg-vignette" />
      <div className="art-bg-grain" />
      {credit ? <div className="art-bg-credit">art · <b>{credit}</b></div> : null}
    </div>
  );
}
