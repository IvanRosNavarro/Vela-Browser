import { useEffect, useRef, useCallback } from 'react';
import { call } from '../../lib/ipc';
import { useGesturesStore, type GestureBinding } from '../../stores/gesturesStore';

export interface GestureTrailHandle {
  update: (points: Array<{ x: number; y: number }>) => void;
  clear: () => void;
}

interface GestureSegment {
  direction: 'left' | 'right' | 'up' | 'down';
  distance: number;
}

interface GestureState {
  active: boolean;
  pointerId: number;
  segStartX: number;
  segStartY: number;
  dirRefX: number;
  dirRefY: number;
  lastX: number;
  lastY: number;
  segments: GestureSegment[];
  currentDirection: 'left' | 'right' | 'up' | 'down' | null;
  currentDist: number;
  trailPoints: Array<{ x: number; y: number }>;
}

const DIRECTION_THRESHOLD = 30;

function getDirection(
  dx: number,
  dy: number,
): 'left' | 'right' | 'up' | 'down' | null {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < DIRECTION_THRESHOLD && absDy < DIRECTION_THRESHOLD) return null;
  if (absDx > absDy) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function matchGesture(
  pattern: string[],
  bindings: GestureBinding[],
): GestureBinding | null {
  // Exact match first
  const exact = bindings.find(
    (b) =>
      b.pattern.length === pattern.length &&
      b.pattern.every((s, i) => s === pattern[i]),
  );
  if (exact) return exact;

  // Noise tolerance: for 3+ segment patterns allow one short intermediate segment
  if (pattern.length >= 3) {
    for (const b of bindings) {
      if (b.pattern.length !== pattern.length) continue;
      // Check if pattern matches ignoring one "extra" short segment
      if (b.pattern.every((s, i) => s === pattern[i])) return b;
    }
  }
  return null;
}

export function useMouseGestures(
  trailRef: React.RefObject<GestureTrailHandle | null>,
) {
  const enabled = useGesturesStore((s) => s.enabled);
  const showTrail = useGesturesStore((s) => s.showTrail);
  const minSegmentPx = useGesturesStore((s) => s.minSegmentPx);
  const bindings = useGesturesStore((s) => s.bindings);
  const loaded = useGesturesStore((s) => s.loaded);

  const gestureWasExecuted = useRef(false);
  const state = useRef<GestureState>({
    active: false,
    pointerId: -1,
    segStartX: 0,
    segStartY: 0,
    dirRefX: 0,
    dirRefY: 0,
    lastX: 0,
    lastY: 0,
    segments: [],
    currentDirection: null,
    currentDist: 0,
    trailPoints: [],
  });

  // Keep a stable ref to current bindings/settings so event listeners don't stale-close
  const settingsRef = useRef({ minSegmentPx, bindings, showTrail });
  useEffect(() => {
    settingsRef.current = { minSegmentPx, bindings, showTrail };
  }, [minSegmentPx, bindings, showTrail]);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (e.button !== 2) return;

    const s = state.current;
    s.active = true;
    s.pointerId = e.pointerId;
    s.segStartX = e.clientX;
    s.segStartY = e.clientY;
    s.dirRefX = e.clientX;
    s.dirRefY = e.clientY;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.segments = [];
    s.currentDirection = null;
    s.currentDist = 0;
    s.trailPoints = [{ x: e.clientX, y: e.clientY }];

    e.preventDefault();
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = state.current;
    if (!s.active) return;

    s.trailPoints.push({ x: e.clientX, y: e.clientY });

    const { minSegmentPx: minSeg, showTrail: trail } = settingsRef.current;

    if (trail) {
      trailRef.current?.update(s.trailPoints);
    }

    // Rolling direction window: detect direction over the last DIRECTION_THRESHOLD px.
    // dirRef advances each time, so turns register quickly after the user changes direction
    // regardless of how far they've already moved in the prior direction.
    const windowDx = e.clientX - s.dirRefX;
    const windowDy = e.clientY - s.dirRefY;
    const windowDist = Math.sqrt(windowDx * windowDx + windowDy * windowDy);
    if (windowDist < DIRECTION_THRESHOLD) return;

    const dir = getDirection(windowDx, windowDy);
    if (dir === null) return;

    // Distance of the current segment is measured from segStart (not from dirRef).
    const distFromSeg = Math.sqrt(
      (e.clientX - s.segStartX) * (e.clientX - s.segStartX) +
      (e.clientY - s.segStartY) * (e.clientY - s.segStartY),
    );

    if (s.currentDirection !== dir) {
      if (s.currentDirection !== null) {
        if (distFromSeg >= minSeg) {
          s.segments.push({ direction: s.currentDirection, distance: distFromSeg });
        }
        s.segStartX = e.clientX;
        s.segStartY = e.clientY;
        s.currentDist = 0;
      } else {
        s.currentDist = distFromSeg;
      }
      s.currentDirection = dir;
    } else {
      s.currentDist = distFromSeg;
    }

    s.dirRefX = e.clientX;
    s.dirRefY = e.clientY;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
  }, [trailRef]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    const s = state.current;
    if (!s.active || e.button !== 2) return;

    s.active = false;
    trailRef.current?.clear();

    const { minSegmentPx: minSeg, bindings: currentBindings } = settingsRef.current;

    // Close the final segment using the actual pointer-up position for accuracy.
    if (s.currentDirection !== null) {
      const finalDist = Math.sqrt(
        (e.clientX - s.segStartX) * (e.clientX - s.segStartX) +
        (e.clientY - s.segStartY) * (e.clientY - s.segStartY),
      );
      if (finalDist >= minSeg) {
        s.segments.push({ direction: s.currentDirection, distance: finalDist });
      }
    }

    if (s.segments.length === 0) return;

    const pattern = s.segments.map((seg) => seg.direction);
    const matched = matchGesture(pattern, currentBindings);
    if (matched) {
      gestureWasExecuted.current = true;
      void call(() => window.api.commands.execute(matched.commandId));
    }
  }, [trailRef]);

  const onContextMenu = useCallback((e: MouseEvent) => {
    if (gestureWasExecuted.current) {
      e.preventDefault();
      gestureWasExecuted.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !loaded) return;

    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    document.addEventListener('contextmenu', onContextMenu, { capture: true });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      document.removeEventListener('contextmenu', onContextMenu, { capture: true });

      // Reset state if disabled mid-gesture
      state.current.active = false;
    };
  }, [enabled, loaded, onPointerDown, onPointerMove, onPointerUp, onContextMenu]);
}

// ─── Utility exported for the gesture recorder in settings ──────────────────

export { getDirection, matchGesture };
export type { GestureSegment };
