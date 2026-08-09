import { useEffect, useRef } from "react";

type SwipeControlProps = {
  enabled: boolean;
  baseYear: number;
  compareYear: number;
  positionRef: { current: number };
  onPositionChange: () => void;
};

export default function SwipeControl({ enabled, baseYear, compareYear, positionRef, onPositionChange }: SwipeControlProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);

  const syncPositionVisuals = () => {
    const left = `${positionRef.current * 100}%`;
    if (dividerRef.current) dividerRef.current.style.left = left;
    if (handleRef.current) handleRef.current.style.left = left;
  };

  useEffect(() => {
    syncPositionVisuals();
  }, [enabled, positionRef]);

  const updatePosition = (clientX: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const bounds = rail.getBoundingClientRect();
    positionRef.current = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    syncPositionVisuals();
    onPositionChange();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = "true";
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.dataset.dragging !== "true") return;
    event.preventDefault();
    event.stopPropagation();
    updatePosition(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.dataset.dragging = "false";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div ref={railRef} className={`swipe-control${enabled ? " is-enabled" : ""}`} aria-hidden={!enabled}>
    <div className="swipe-label swipe-label-base"><span className="swipe-year-text">{baseYear}년 · 과거</span></div>
    <div className="swipe-label swipe-label-compare"><span className="swipe-year-text">{compareYear}년 · 최근</span></div>
    <div ref={dividerRef} className="swipe-rail" style={{ left: `${positionRef.current * 100}%` }} />
    {enabled && <span className="swipe-hint">좌우로 움직여 비교</span>}
    <button
      ref={handleRef}
      type="button"
      className="swipe-handle"
      style={{ left: `${positionRef.current * 100}%` }}
      aria-label={`${baseYear}년 기준과 ${compareYear}년 비교 위치 조절`}
      title="좌우로 드래그하여 비교 위치 조절"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <span aria-hidden="true">◀ ● ▶</span>
    </button>
  </div>;
}
