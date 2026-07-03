// Ambient background: starfield + glow + two counter-rotating orbital rings (verbatim from the
// explorer). Fixed, z-index:0, pointer-events:none — content sits in `.shell` above it. The
// starfield fades on light theme (--star-opacity:0); animations disabled under reduced-motion.
export function Atmosphere() {
  return (
    <>
      <div className="atmosphere">
        <div className="stars" />
      </div>
      <div className="glow" />
      <div className="ring r1" />
      <div className="ring r2" />
    </>
  );
}
