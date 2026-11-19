import {
  clamp,
  clampTranslate,
  maxTranslate,
  normalizeScales,
  rubberBand,
  rubberBandScale,
  splitStyle,
  translateForFocal,
} from '../utils/math';

describe('clamp', () => {
  it('clamps into range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
  it('returns the midpoint for an inverted range', () => {
    expect(clamp(3, 10, 0)).toBe(5);
  });
});

describe('translateForFocal', () => {
  // content point drawn at t + s * p must stay under the focal point
  const drawn = (t: number, s: number, p: number) => t + s * p;

  it('keeps the content point under a fixed focal point while scaling', () => {
    const focal = 80;
    const t0 = 10;
    const s0 = 1.5;
    const p = (focal - t0) / s0;
    for (const s of [0.5, 1, 2, 3.7]) {
      const t = translateForFocal(focal, focal, s, s0, t0);
      expect(drawn(t, s, p)).toBeCloseTo(focal, 10);
    }
  });

  it('follows a moving focal point (two-finger pan)', () => {
    const t = translateForFocal(130, 100, 2, 2, 0);
    // same scale: translation equals the focal movement
    expect(t).toBeCloseTo(30, 10);
  });

  it('zooming at the center does not translate', () => {
    expect(translateForFocal(0, 0, 4, 1, 0)).toBeCloseTo(0, 10);
  });

  it('ignores a degenerate start scale', () => {
    expect(translateForFocal(10, 0, 2, 0, 7)).toBe(7);
  });
});

describe('maxTranslate / clampTranslate', () => {
  it('threshold grows with the zoom factor', () => {
    expect(maxTranslate('threshold', 400, 1, 1, 300)).toBe(300);
    expect(maxTranslate('threshold', 400, 2, 1, 300)).toBe(600);
    expect(maxTranslate('threshold', 400, 3, 1.5, 100)).toBe(200);
  });

  it('content boundary never reveals empty space', () => {
    expect(maxTranslate('content', 400, 1, 1, 0)).toBe(0);
    expect(maxTranslate('content', 400, 2, 1, 0)).toBe(200);
    expect(maxTranslate('content', 400, 0.5, 0.5, 0)).toBe(0);
    expect(maxTranslate('content', 0, 3, 1, 0)).toBe(0);
  });

  it('none is unlimited', () => {
    expect(maxTranslate('none', 400, 1, 1, 0)).toBe(Infinity);
    expect(clampTranslate(1e9, 'none', 400, 1, 1, 0)).toBe(1e9);
  });

  it('clamps symmetrically', () => {
    expect(clampTranslate(500, 'content', 400, 2, 1, 0)).toBe(200);
    expect(clampTranslate(-500, 'content', 400, 2, 1, 0)).toBe(-200);
    expect(clampTranslate(50, 'content', 400, 1, 1, 0)).toBe(0);
  });
});

describe('rubberBand', () => {
  it('passes values inside the limit', () => {
    expect(rubberBand(50, 100, 400)).toBe(50);
    expect(rubberBand(-50, 100, 400)).toBe(-50);
  });
  it('follows the iOS curve beyond the limit', () => {
    const d = 400;
    const x = 200;
    const expected = 100 + (1 - 1 / ((x * 0.55) / d + 1)) * d;
    expect(rubberBand(300, 100, d)).toBeCloseTo(expected, 10);
    expect(rubberBand(-300, 100, d)).toBeCloseTo(-expected, 10);
    // resistance: never moves as far as the finger, never reaches d past the limit
    expect(rubberBand(300, 100, d)).toBeLessThan(300);
    expect(rubberBand(1e9, 100, d)).toBeLessThan(100 + d);
  });
  it('is a no-op for infinite limits and a hard stop without a dimension', () => {
    expect(rubberBand(1e6, Infinity, 400)).toBe(1e6);
    expect(rubberBand(150, 100, 0)).toBe(100);
  });
});

describe('rubberBandScale', () => {
  it('passes values inside the range', () => {
    expect(rubberBandScale(1.5, 1, 2, 0.35)).toBe(1.5);
  });
  it('overshoots less than the raw value', () => {
    const over = rubberBandScale(4, 1, 2, 0.35);
    expect(over).toBeGreaterThan(2);
    expect(over).toBeLessThan(4);
    const under = rubberBandScale(0.25, 1, 2, 0.35);
    expect(under).toBeLessThan(1);
    expect(under).toBeGreaterThan(0.25);
  });
  it('hard clamps with factor 0', () => {
    expect(rubberBandScale(4, 1, 2, 0)).toBe(2);
  });
});

describe('normalizeScales', () => {
  it('uses the classic defaults', () => {
    expect(normalizeScales(undefined, undefined, undefined)).toEqual({
      initial: 1,
      min: 1,
      max: 2,
    });
    expect(normalizeScales(1.5, undefined, undefined)).toEqual({
      initial: 1.5,
      min: 1.5,
      max: 3,
    });
  });
  it('repairs inconsistent props', () => {
    expect(normalizeScales(2, 3, 1)).toEqual({ initial: 2, min: 2, max: 2 });
    expect(normalizeScales(0, -1, NaN)).toEqual({ initial: 1, min: 1, max: 2 });
    expect(normalizeScales(1, 0.5, 5)).toEqual({
      initial: 1,
      min: 0.5,
      max: 5,
    });
  });
});

describe('splitStyle', () => {
  it('keeps layout on the outer view and visuals on the content', () => {
    const { outer, inner } = splitStyle({
      flex: 1,
      margin: 4,
      width: 100,
      backgroundColor: 'red',
      padding: 8,
      justifyContent: 'center',
    });
    expect(outer).toEqual({ flex: 1, margin: 4, width: 100 });
    expect(inner).toEqual({
      backgroundColor: 'red',
      padding: 8,
      justifyContent: 'center',
    });
  });
  it('clips on the outer view', () => {
    const { outer, inner } = splitStyle({
      overflow: 'hidden',
      borderRadius: 8,
    });
    expect(outer).toEqual({ overflow: 'hidden', borderRadius: 8 });
    expect(inner).toEqual({});
  });
  it('handles undefined', () => {
    expect(splitStyle(undefined)).toEqual({ outer: {}, inner: {} });
  });
});
