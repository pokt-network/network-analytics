// Ambient background: starfield + a soft corner glow. Fixed, z-index:0, pointer-events:none —
// content sits in `.shell` above it. The starfield fades on light theme (--star-opacity:0);
// animations disabled under reduced-motion. (Orbital rings removed — too visually heavy.)
export function Atmosphere() {
  return (
    <>
      <div className="atmosphere">
        <div className="stars" />
      </div>
      <div className="glow" />
    </>
  );
}
