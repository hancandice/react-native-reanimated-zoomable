/**
 * Pure, worklet-safe math used by `Zoomable`.
 *
 * Coordinate system: every point is relative to the *center* of the zoomable
 * container (the untransformed view). The content is rendered with
 * `transform: [{ translateX }, { translateY }, { scale }]` around its center,
 * so a content point `p` (relative to the content center, unscaled) is drawn at
 * `t + s * p`.
 */

/** How far the content may be dragged away from its resting position. */
export type PanBoundary = 'threshold' | 'content' | 'none';

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  if (min > max) {
    return (min + max) / 2;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Translation (on one axis) that keeps the content point that was under
 * `focalStart` – at scale `scaleStart` and translation `translateStart` – under
 * `focal` once the scale becomes `scale`.
 *
 * `focal` and `focalStart` are relative to the container center. Moving the
 * focal point (two-finger drag) therefore also pans the content.
 */
export function translateForFocal(
  focal: number,
  focalStart: number,
  scale: number,
  scaleStart: number,
  translateStart: number
): number {
  'worklet';
  if (!(scaleStart > 0)) {
    return translateStart;
  }
  // content point (unscaled, relative to the content center) under the focal point
  const contentPoint = (focalStart - translateStart) / scaleStart;
  return focal - scale * contentPoint;
}

/**
 * Largest allowed |translation| on one axis for the given scale.
 *
 * - `threshold`: the classic behavior of this library – `threshold` points,
 *   growing proportionally with the zoom factor (`scale / minScale`).
 * - `content`: the scaled content may not reveal empty space inside the
 *   container edges: `(scale * length - length) / 2` (0 when not zoomed in).
 * - `none`: unlimited.
 */
export function maxTranslate(
  boundary: PanBoundary,
  length: number,
  scale: number,
  minScale: number,
  threshold: number
): number {
  'worklet';
  if (boundary === 'none') {
    return Number.POSITIVE_INFINITY;
  }
  if (boundary === 'content') {
    return Math.max(0, (length * scale - length) / 2);
  }
  const factor = minScale > 0 ? scale / minScale : scale;
  return Math.max(0, threshold * factor);
}

/** Clamps a translation on one axis to the boundary. */
export function clampTranslate(
  value: number,
  boundary: PanBoundary,
  length: number,
  scale: number,
  minScale: number,
  threshold: number
): number {
  'worklet';
  const limit = maxTranslate(boundary, length, scale, minScale, threshold);
  return clamp(value, -limit, limit);
}

/**
 * iOS-style rubber band: movement beyond `limit` is resisted with
 * `offset = (1 - 1 / (x * 0.55 / d + 1)) * d`, where `x` is the overshoot and
 * `d` the size of the container on that axis.
 */
export function rubberBand(
  value: number,
  limit: number,
  dimension: number,
  coefficient: number = 0.55
): number {
  'worklet';
  if (!Number.isFinite(limit)) {
    return value;
  }
  const abs = Math.abs(value);
  if (abs <= limit) {
    return value;
  }
  if (!(dimension > 0)) {
    return Math.sign(value) * limit;
  }
  const overshoot = abs - limit;
  const offset =
    (1 - 1 / ((overshoot * coefficient) / dimension + 1)) * dimension;
  return Math.sign(value) * (limit + offset);
}

/**
 * Applies rubber-band resistance to a scale outside `[min, max]`, so that a
 * pinch can slightly overshoot the limits and bounce back on release.
 */
export function rubberBandScale(
  scale: number,
  min: number,
  max: number,
  factor: number
): number {
  'worklet';
  if (factor <= 0) {
    return clamp(scale, min, max);
  }
  if (scale > max) {
    return max * Math.pow(scale / max, factor);
  }
  if (scale < min) {
    return min * Math.pow(scale / min, factor);
  }
  return scale;
}

/** Normalizes user scale props so that `0 < min <= initial <= max` always holds. */
export function normalizeScales(
  initialScale: number | undefined,
  minScale: number | undefined,
  maxScale: number | undefined
): { initial: number; min: number; max: number } {
  'worklet';
  const safe = (n: number | undefined, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : fallback;
  const initial = safe(initialScale, 1);
  const min = Math.min(safe(minScale, initial), initial);
  const max = Math.max(safe(maxScale, initial * 2), initial);
  return { initial, min, max };
}

/** Splits a flattened style into the outer (layout) and inner (content) parts. */
const OUTER_KEYS: Record<string, true> = {
  position: true,
  top: true,
  bottom: true,
  left: true,
  right: true,
  start: true,
  end: true,
  inset: true,
  insetBlock: true,
  insetBlockEnd: true,
  insetBlockStart: true,
  insetInline: true,
  insetInlineEnd: true,
  insetInlineStart: true,
  margin: true,
  marginTop: true,
  marginBottom: true,
  marginLeft: true,
  marginRight: true,
  marginStart: true,
  marginEnd: true,
  marginHorizontal: true,
  marginVertical: true,
  marginBlock: true,
  marginBlockEnd: true,
  marginBlockStart: true,
  marginInline: true,
  marginInlineEnd: true,
  marginInlineStart: true,
  flex: true,
  flexGrow: true,
  flexShrink: true,
  flexBasis: true,
  alignSelf: true,
  width: true,
  height: true,
  minWidth: true,
  minHeight: true,
  maxWidth: true,
  maxHeight: true,
  aspectRatio: true,
  zIndex: true,
  display: true,
  overflow: true,
  borderRadius: true,
  borderTopLeftRadius: true,
  borderTopRightRadius: true,
  borderBottomLeftRadius: true,
  borderBottomRightRadius: true,
  borderTopStartRadius: true,
  borderTopEndRadius: true,
  borderBottomStartRadius: true,
  borderBottomEndRadius: true,
  borderCurve: true,
  transform: true,
  transformOrigin: true,
  opacity: true,
};

export function splitStyle(style: Record<string, unknown> | undefined): {
  outer: Record<string, unknown>;
  inner: Record<string, unknown>;
} {
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  if (style) {
    for (const key of Object.keys(style)) {
      if (OUTER_KEYS[key]) {
        outer[key] = style[key];
      } else {
        inner[key] = style[key];
      }
    }
  }
  return { outer, inner };
}
