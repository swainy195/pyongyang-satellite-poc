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
  const handleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (handleRef.current) handleRef.current.style.left = `${positionRef.current * 100}%`;
  }, [enabled, positionRef]);

  const updatePosition = (clientX: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const bounds = rail.getBoundingClientRect();
    positionRef.current = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    if (handleRef.current) handleRef.current.style.left = `${positionRef.current * 100}%`;
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
    <div className="swipe-label swipe-label-base"><strong>{baseYear}년</strong><small>과거</small></div>
    <div className="swipe-label swipe-label-compare"><strong>{compareYear}년</strong><small>최근</small></div>
    <div className="swipe-rail" />
    <button
      ref={handleRef}
      type="button"
      className="swipe-handle"
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
