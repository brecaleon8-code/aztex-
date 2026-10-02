/** Fixed spatial backdrop: drifting aurora blobs, faint perspective grid, film grain, vignette. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="aurora a3" />
      <div className="aurora a4" />
      <div className="gridlines" />
      <div className="vignette" />
      <div className="grain" />
    </div>
  );
}
