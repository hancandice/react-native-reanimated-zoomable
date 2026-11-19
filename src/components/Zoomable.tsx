import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ForwardedRef,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

import {
  clamp,
  clampTranslate,
  maxTranslate,
  normalizeScales,
  rubberBand,
  rubberBandScale,
  splitStyle,
  translateForFocal,
  type PanBoundary,
} from '../utils/math';

/** A snapshot of the current transform. */
export interface ZoomableTransform {
  scale: number;
  translate: { x: number; y: number };
}

/** Transform passed to the `onTransform` worklet on every frame. */
export interface ZoomableTransformFrame {
  scale: number;
  translateX: number;
  translateY: number;
}

/** Position of a tap, relative to the top-left corner of the component. */
export interface ZoomableTapEvent {
  x: number;
  y: number;
}

export interface ZoomableRef {
  /**
   * Immediately sets the scale and/or translation (no animation).
   * Values are clamped to `[minScale, maxScale]` and to the pan boundary.
   * Calls made before the first layout are applied once the size is known.
   */
  setValues(values: {
    scale?: number;
    translate?: { x: number; y: number };
  }): void;
  /**
   * Zooms to `scale`. When `focal` (relative to the top-left corner of the
   * component) is given, the content point under it stays in place; otherwise
   * the zoom is centered on the current view. Animated by default.
   */
  zoomTo(
    scale: number,
    options?: { focal?: { x: number; y: number }; animated?: boolean }
  ): void;
  /** Returns to `initialScale` and no translation. Animated by default. */
  reset(options?: { animated?: boolean }): void;
  /** Reads the current transform. */
  getValues(): ZoomableTransform;
}

export interface ZoomableProps {
  children?: ReactNode;
  /**
   * Style of the zoomable container. Layout props (size, flex, margins,
   * position, transform, opacity, overflow, border radius) stay on the
   * untransformed container, so `overflow: 'hidden'` clips the zoomed content.
   * Everything else (background, padding, alignment of the children, …) is
   * applied to the zoomed content. Reanimated animated styles are applied to
   * the content; their `transform` is overridden by the zoom transform.
   */
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
  /** Scale on mount and after `reset()`. @default 1 */
  initialScale?: number;
  /** Smallest scale reachable with a pinch. @default initialScale */
  minScale?: number;
  /** Largest scale reachable with a pinch. @default initialScale * 2 */
  maxScale?: number;
  /**
   * How far the content can be dragged:
   * - `'content'` – never reveal empty space inside the container edges
   *   (photo-viewer behavior)
   * - `'threshold'` – up to `panThreshold * scale / minScale` points (0.x behavior)
   * - `'none'` – unlimited
   * @default 'content'
   */
  panBoundary?: PanBoundary;
  /**
   * Maximum translation in points (at `minScale`) when `panBoundary` is
   * `'threshold'`. The allowed distance grows with the zoom factor.
   * @default 300
   */
  panThreshold?: number;
  /**
   * When the content is released beyond the boundary, animate it back to the
   * center instead of to the boundary. @default false
   */
  centerOnRelease?: boolean;
  /**
   * Animate the content back inside the boundary when it is released outside
   * of it. When `false` it stays where it was released (the scale is still
   * brought back inside `[minScale, maxScale]`). @default true
   */
  releaseAnimation?: boolean;
  /** Keep moving (with decay) after a fling. @default true */
  momentum?: boolean;
  /**
   * Double tap zooms in to `doubleTapScale` at the tapped point, or back to
   * `initialScale` when already zoomed. @default false
   */
  doubleTapToZoom?: boolean;
  /** Target scale of a double tap. @default min(maxScale, 2.5 * initialScale) */
  doubleTapScale?: number;
  /**
   * Only allow one-finger panning while zoomed in. Use it inside a
   * `ScrollView`, pager or bottom sheet so that the parent keeps receiving
   * drags while the content is not zoomed. @default false
   */
  panRequiresZoom?: boolean;
  /** Disables all gestures. @default false */
  disabled?: boolean;
  /**
   * Called (JS thread) on a single tap. When double tap is enabled it waits
   * until a double tap is ruled out.
   */
  onSingleTap?: (event: ZoomableTapEvent) => void;
  /** Called (JS thread) on a double tap, whether or not `doubleTapToZoom` is on. */
  onDoubleTap?: (event: ZoomableTapEvent) => void;
  /**
   * Worklet called on the UI thread whenever the transform changes – use it to
   * fade chrome or drive swipe-to-dismiss without touching the JS thread.
   * Must be a worklet (`'worklet'` directive).
   */
  onTransform?: (transform: ZoomableTransformFrame) => void;
  /** Called on the JS thread when a pinch, pan or double tap begins. */
  onInteractionStart?: () => void;
  /**
   * Called on the JS thread when an interaction ends, with the transform the
   * content settles to.
   */
  onInteractionEnd?: (transform: ZoomableTransform) => void;
  /** Used to locate this view in end-to-end tests. */
  testID?: string;

  /** @deprecated Renamed to `panThreshold`. */
  threshold?: number;
  /** @deprecated Renamed to `centerOnRelease`. */
  shouldCenterAfterThreshold?: boolean;
  /** @deprecated Use `releaseAnimation={false}`. */
  disablePanResponderReleaseAction?: boolean;
  /** @deprecated Use `momentum={false}`. */
  disableOvershooting?: boolean;
}

const EPSILON = 0.001;
const SCALE_RUBBER_BAND = 0.35;
const PAN_SLOP = 10;
const TAP_SLOP = 10;
const DECELERATION = 0.998;

const SPRING = {
  mass: 1,
  damping: 26,
  stiffness: 260,
  reduceMotion: ReduceMotion.System,
};
const ZOOM_TIMING = {
  duration: 280,
  easing: Easing.bezier(0.2, 0, 0, 1),
  reduceMotion: ReduceMotion.System,
};

const spring = (toValue: number) => {
  'worklet';
  return withSpring(toValue, SPRING);
};

const zoomTiming = (toValue: number) => {
  'worklet';
  return withTiming(toValue, ZOOM_TIMING);
};

const warned = new Set<string>();
function warnOnce(message: string) {
  if (__DEV__ && !warned.has(message)) {
    warned.add(message);
    console.warn(`react-native-reanimated-zoomable: ${message}`);
  }
}

const isAnimatedStyle = (style: unknown): boolean =>
  typeof style === 'object' && style !== null && 'viewDescriptors' in style;

/** Separates plain style objects (which are split) from Reanimated styles. */
const partitionStyle = (style: ZoomableProps['style']) => {
  const plain: StyleProp<ViewStyle>[] = [];
  const animated: ViewStyle[] = [];
  const visit = (s: unknown) => {
    if (Array.isArray(s)) {
      s.forEach(visit);
    } else if (isAnimatedStyle(s)) {
      animated.push(s as ViewStyle);
    } else if (s) {
      plain.push(s as StyleProp<ViewStyle>);
    }
  };
  visit(style);
  const flat = StyleSheet.flatten(plain) as Record<string, unknown> | undefined;
  const { outer, inner } = splitStyle(flat);
  return {
    outer: outer as ViewStyle,
    inner: inner as ViewStyle,
    animated,
  };
};

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const ZoomableComponent = (
  props: ZoomableProps,
  ref: ForwardedRef<ZoomableRef>
) => {
  const {
    children,
    style,
    initialScale: initialScaleProp,
    minScale: minScaleProp,
    maxScale: maxScaleProp,
    panBoundary = 'content',
    doubleTapToZoom = false,
    doubleTapScale: doubleTapScaleProp,
    panRequiresZoom = false,
    disabled = false,
    onSingleTap,
    onDoubleTap,
    onTransform,
    onInteractionStart,
    onInteractionEnd,
    testID,
  } = props;

  // legacy names (0.x) keep working
  if (props.threshold !== undefined) {
    warnOnce('`threshold` is deprecated, use `panThreshold`.');
  }
  if (props.shouldCenterAfterThreshold !== undefined) {
    warnOnce(
      '`shouldCenterAfterThreshold` is deprecated, use `centerOnRelease`.'
    );
  }
  if (props.disablePanResponderReleaseAction !== undefined) {
    warnOnce(
      '`disablePanResponderReleaseAction` is deprecated, use `releaseAnimation={false}`.'
    );
  }
  if (props.disableOvershooting !== undefined) {
    warnOnce('`disableOvershooting` is deprecated, use `momentum={false}`.');
  }
  const threshold = props.panThreshold ?? props.threshold ?? 300;
  const centerOnRelease =
    props.centerOnRelease ?? props.shouldCenterAfterThreshold ?? false;
  const releaseAnimation =
    props.releaseAnimation ??
    !(props.disablePanResponderReleaseAction ?? false);
  const momentum = props.momentum ?? !(props.disableOvershooting ?? false);

  const {
    initial: initialScale,
    min: minScale,
    max: maxScale,
  } = normalizeScales(initialScaleProp, minScaleProp, maxScaleProp);
  const doubleTapScale = clamp(
    doubleTapScaleProp ?? Math.min(maxScale, initialScale * 2.5),
    minScale,
    maxScale
  );
  const safeThreshold =
    Number.isFinite(threshold) && threshold >= 0 ? threshold : 300;

  const scale = useSharedValue(initialScale);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // layout of the content, relative to the gesture container
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const centerX = useSharedValue(0);
  const centerY = useSharedValue(0);

  // pinch bookkeeping (UI thread only)
  const pinchScale = useSharedValue(1);
  const pinchRawScale = useSharedValue(1);
  const rawScale = useSharedValue(1);
  const pinchStart = useSharedValue(1);
  const pointerCount = useSharedValue(0);
  const pinchX = useSharedValue(0);
  const pinchY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);
  const lastFocalX = useSharedValue(0);
  const lastFocalY = useSharedValue(0);
  const pinching = useSharedValue(false);
  // pan bookkeeping (separate anchors, see pinch onFinalize)
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const panTranslationX = useSharedValue(0);
  const panTranslationY = useSharedValue(0);
  const panning = useSharedValue(false);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);

  // Latest callbacks, so that inline functions do not rebuild the gestures.
  const listeners = useRef({
    onInteractionStart,
    onInteractionEnd,
    onSingleTap,
    onDoubleTap,
  });
  useLayoutEffect(() => {
    listeners.current = {
      onInteractionStart,
      onInteractionEnd,
      onSingleTap,
      onDoubleTap,
    };
  });

  const emitStart = useCallback(() => {
    listeners.current.onInteractionStart?.();
  }, []);
  const emitEnd = useCallback((s: number, x: number, y: number) => {
    listeners.current.onInteractionEnd?.({ scale: s, translate: { x, y } });
  }, []);
  const emitSingleTap = useCallback((x: number, y: number) => {
    listeners.current.onSingleTap?.({ x, y });
  }, []);
  const emitDoubleTap = useCallback((x: number, y: number) => {
    listeners.current.onDoubleTap?.({ x, y });
  }, []);

  const hasStartListener = onInteractionStart != null;
  const hasEndListener = onInteractionEnd != null;
  const hasSingleTap = onSingleTap != null;
  const hasDoubleTap = onDoubleTap != null;

  const gesture = useMemo(() => {
    const stopAnimations = () => {
      'worklet';
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    };

    const notifyStart = () => {
      'worklet';
      if (hasStartListener && !pinching.value && !panning.value) {
        runOnJS(emitStart)();
      }
    };

    const notifyEnd = (s: number, x: number, y: number) => {
      'worklet';
      if (hasEndListener) {
        runOnJS(emitEnd)(s, x, y);
      }
    };

    const limit = (length: number, s: number) => {
      'worklet';
      return maxTranslate(panBoundary, length, s, minScale, safeThreshold);
    };

    /**
     * Brings scale and translation back inside the allowed limits, optionally
     * continuing a fling with the release velocity.
     */
    const settle = (velocityX: number, velocityY: number) => {
      'worklet';
      const s = scale.value;
      const targetScale = clamp(s, minScale, maxScale);
      const scaleChanged = Math.abs(targetScale - s) > EPSILON;
      // scale back around the last focal point so the overshoot bounces in place
      let x = translateForFocal(
        lastFocalX.value,
        lastFocalX.value,
        targetScale,
        s,
        translateX.value
      );
      let y = translateForFocal(
        lastFocalY.value,
        lastFocalY.value,
        targetScale,
        s,
        translateY.value
      );

      if (scaleChanged) {
        scale.value = spring(targetScale);
      }

      if (!releaseAnimation) {
        if (scaleChanged) {
          translateX.value = spring(x);
          translateY.value = spring(y);
        }
        notifyEnd(targetScale, x, y);
        return;
      }

      const limitX = limit(width.value, targetScale);
      const limitY = limit(height.value, targetScale);
      const overflow =
        Math.abs(x) > limitX + EPSILON || Math.abs(y) > limitY + EPSILON;

      if (overflow) {
        if (centerOnRelease) {
          x = 0;
          y = 0;
        } else {
          x = clamp(x, -limitX, limitX);
          y = clamp(y, -limitY, limitY);
        }
        translateX.value = spring(x);
        translateY.value = spring(y);
      } else if (
        momentum &&
        !scaleChanged &&
        (Math.abs(velocityX) > 1 || Math.abs(velocityY) > 1)
      ) {
        const decay = (velocity: number, max: number) => {
          'worklet';
          return Number.isFinite(max)
            ? withDecay({
                velocity,
                deceleration: DECELERATION,
                clamp: [-max, max],
                rubberBandEffect: true,
                rubberBandFactor: 0.6,
                reduceMotion: ReduceMotion.System,
              })
            : withDecay({
                velocity,
                deceleration: DECELERATION,
                reduceMotion: ReduceMotion.System,
              });
        };
        translateX.value = decay(velocityX, limitX);
        translateY.value = decay(velocityY, limitY);
        // resting point of the decay: v * k / (1 - k) ms with k per-ms friction
        const travel = DECELERATION / (1 - DECELERATION) / 1000;
        x = clamp(x + velocityX * travel, -limitX, limitX);
        y = clamp(y + velocityY * travel, -limitY, limitY);
      } else if (scaleChanged) {
        translateX.value = spring(x);
        translateY.value = spring(y);
      }

      notifyEnd(targetScale, x, y);
    };

    /** (Re)anchors the pinch so that a change of pointers does not jump. */
    const anchorPinch = (
      focalX: number,
      focalY: number,
      eventScale: number,
      pointers: number
    ) => {
      'worklet';
      pinchScale.value = scale.value;
      pinchRawScale.value = rawScale.value;
      pinchStart.value = eventScale > 0 ? eventScale : 1;
      pinchX.value = translateX.value;
      pinchY.value = translateY.value;
      pinchFocalX.value = focalX - centerX.value;
      pinchFocalY.value = focalY - centerY.value;
      lastFocalX.value = pinchFocalX.value;
      lastFocalY.value = pinchFocalY.value;
      pointerCount.value = pointers;
    };

    const pinch = Gesture.Pinch()
      .enabled(!disabled)
      .onStart((e) => {
        'worklet';
        notifyStart();
        stopAnimations();
        pinching.value = true;
        rawScale.value = scale.value;
        anchorPinch(e.focalX, e.focalY, e.scale, e.numberOfPointers);
      })
      .onUpdate((e) => {
        'worklet';
        if (!pinching.value) {
          return;
        }
        // When a finger is lifted (or added) the focal point jumps to the
        // remaining fingers: ignore single-finger updates and re-anchor.
        if (e.numberOfPointers < 2) {
          pointerCount.value = e.numberOfPointers;
          return;
        }
        if (e.numberOfPointers !== pointerCount.value) {
          anchorPinch(e.focalX, e.focalY, e.scale, e.numberOfPointers);
          return;
        }
        rawScale.value = (pinchRawScale.value * e.scale) / pinchStart.value;
        const s = rubberBandScale(
          rawScale.value,
          minScale,
          maxScale,
          SCALE_RUBBER_BAND
        );
        const fx = e.focalX - centerX.value;
        const fy = e.focalY - centerY.value;
        lastFocalX.value = fx;
        lastFocalY.value = fy;
        let x = translateForFocal(
          fx,
          pinchFocalX.value,
          s,
          pinchScale.value,
          pinchX.value
        );
        let y = translateForFocal(
          fy,
          pinchFocalY.value,
          s,
          pinchScale.value,
          pinchY.value
        );
        if (panBoundary === 'content') {
          const cs = clamp(s, minScale, maxScale);
          x = rubberBand(x, limit(width.value, cs), width.value);
          y = rubberBand(y, limit(height.value, cs), height.value);
        }
        scale.value = s;
        translateX.value = x;
        translateY.value = y;
      })
      .onFinalize(() => {
        'worklet';
        if (!pinching.value) {
          return;
        }
        pinching.value = false;
        if (panning.value) {
          // The pan kept tracking the remaining finger (iOS): continue from the
          // current position instead of jumping back to where the pan started.
          panX.value = translateX.value - panTranslationX.value;
          panY.value = translateY.value - panTranslationY.value;
        } else {
          settle(0, 0);
        }
      });

    const pan = Gesture.Pan()
      .enabled(!disabled)
      .maxPointers(1)
      .minDistance(PAN_SLOP)
      .manualActivation(panRequiresZoom)
      .onTouchesDown((e) => {
        'worklet';
        const touch = e.allTouches[0];
        if (touch) {
          touchStartX.value = touch.absoluteX;
          touchStartY.value = touch.absoluteY;
        }
      })
      .onTouchesMove((e, manager) => {
        'worklet';
        if (!panRequiresZoom) {
          return;
        }
        if (e.numberOfTouches > 1) {
          manager.fail();
          return;
        }
        const touch = e.allTouches[0];
        if (!touch) {
          return;
        }
        const dx = touch.absoluteX - touchStartX.value;
        const dy = touch.absoluteY - touchStartY.value;
        if (dx * dx + dy * dy < PAN_SLOP * PAN_SLOP) {
          return;
        }
        // minScale <= initialScale, so "zoomed in" means above initialScale
        if (scale.value > initialScale + EPSILON) {
          manager.activate();
        } else {
          manager.fail();
        }
      })
      .onStart(() => {
        'worklet';
        notifyStart();
        if (!pinching.value) {
          stopAnimations();
        }
        panning.value = true;
        panTranslationX.value = 0;
        panTranslationY.value = 0;
        panX.value = translateX.value;
        panY.value = translateY.value;
      })
      .onUpdate((e) => {
        'worklet';
        panTranslationX.value = e.translationX;
        panTranslationY.value = e.translationY;
        if (!panning.value || pinching.value) {
          return;
        }
        let x = panX.value + e.translationX;
        let y = panY.value + e.translationY;
        if (panBoundary === 'content') {
          const s = scale.value;
          x = rubberBand(x, limit(width.value, s), width.value);
          y = rubberBand(y, limit(height.value, s), height.value);
        }
        translateX.value = x;
        translateY.value = y;
      })
      .onEnd((e, success) => {
        'worklet';
        if (!panning.value) {
          return;
        }
        panning.value = false;
        if (pinching.value) {
          return;
        }
        // a cancelled pan (e.g. taken over by a parent) must not fling
        settle(success ? e.velocityX : 0, success ? e.velocityY : 0);
      })
      .onFinalize(() => {
        'worklet';
        if (panning.value) {
          // cancelled before it ended (e.g. a second finger on Android)
          panning.value = false;
          if (!pinching.value) {
            settle(0, 0);
          }
        }
      });

    // A symmetric pinch keeps the centroid still, so the tap gestures must
    // explicitly fail as soon as a second finger touches the screen.
    const failOnMultiTouch = (
      e: { numberOfTouches: number },
      manager: { fail: () => void }
    ) => {
      'worklet';
      if (e.numberOfTouches > 1) {
        manager.fail();
      }
    };

    const doubleTap = Gesture.Tap()
      .enabled(!disabled && (doubleTapToZoom || hasDoubleTap))
      .numberOfTaps(2)
      .maxDistance(24)
      .onTouchesDown(failOnMultiTouch)
      .onEnd((e, success) => {
        'worklet';
        if (!success || pinching.value || panning.value) {
          return;
        }
        if (hasDoubleTap) {
          runOnJS(emitDoubleTap)(e.x, e.y);
        }
        if (!doubleTapToZoom) {
          return;
        }
        notifyStart();
        stopAnimations();
        const s = scale.value;
        let targetScale = initialScale;
        let x = 0;
        let y = 0;
        if (Math.abs(s - initialScale) <= EPSILON) {
          targetScale = doubleTapScale;
          const fx = e.x - centerX.value;
          const fy = e.y - centerY.value;
          x = clampTranslate(
            translateForFocal(fx, fx, targetScale, s, translateX.value),
            panBoundary,
            width.value,
            targetScale,
            minScale,
            safeThreshold
          );
          y = clampTranslate(
            translateForFocal(fy, fy, targetScale, s, translateY.value),
            panBoundary,
            height.value,
            targetScale,
            minScale,
            safeThreshold
          );
        }
        scale.value = zoomTiming(targetScale);
        translateX.value = zoomTiming(x);
        translateY.value = zoomTiming(y);
        notifyEnd(targetScale, x, y);
      });

    const singleTap = Gesture.Tap()
      .enabled(!disabled && hasSingleTap)
      .maxDistance(TAP_SLOP)
      .onTouchesDown(failOnMultiTouch)
      .onEnd((e, success) => {
        'worklet';
        if (success && !pinching.value && !panning.value) {
          runOnJS(emitSingleTap)(e.x, e.y);
        }
      });

    // the single tap waits until the double tap has failed
    return Gesture.Simultaneous(
      pinch,
      pan,
      Gesture.Exclusive(doubleTap, singleTap)
    );
  }, [
    centerOnRelease,
    centerX,
    centerY,
    disabled,
    doubleTapScale,
    doubleTapToZoom,
    emitDoubleTap,
    emitEnd,
    emitSingleTap,
    emitStart,
    hasDoubleTap,
    hasEndListener,
    hasSingleTap,
    hasStartListener,
    height,
    initialScale,
    lastFocalX,
    lastFocalY,
    maxScale,
    minScale,
    momentum,
    panBoundary,
    panRequiresZoom,
    panTranslationX,
    panTranslationY,
    panX,
    panY,
    panning,
    pinchFocalX,
    pinchFocalY,
    pinchRawScale,
    pinchScale,
    pinchStart,
    pinchX,
    pinchY,
    pinching,
    pointerCount,
    rawScale,
    releaseAnimation,
    safeThreshold,
    scale,
    touchStartX,
    touchStartY,
    translateX,
    translateY,
    width,
  ]);

  // Keep the translation valid when the content resizes (device rotation,
  // children layout changes).
  useAnimatedReaction(
    () => [width.value, height.value],
    (current, previous) => {
      const [w = 0, h = 0] = current;
      if (
        previous == null ||
        pinching.value ||
        panning.value ||
        (previous[0] === w && previous[1] === h)
      ) {
        return;
      }
      const s = scale.value;
      translateX.value = clampTranslate(
        translateX.value,
        panBoundary,
        w,
        s,
        minScale,
        safeThreshold
      );
      translateY.value = clampTranslate(
        translateY.value,
        panBoundary,
        h,
        s,
        minScale,
        safeThreshold
      );
    }
  );

  // UI-thread transform listener
  useAnimatedReaction(
    () => ({
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    }),
    (frame) => {
      if (onTransform) {
        onTransform(frame);
      }
    }
  );

  // Keep scale and translation valid when the limits change.
  useEffect(() => {
    if (pinching.value || panning.value) {
      return;
    }
    const s = clamp(scale.value, minScale, maxScale);
    const x = clampTranslate(
      translateX.value,
      panBoundary,
      width.value,
      s,
      minScale,
      safeThreshold
    );
    const y = clampTranslate(
      translateY.value,
      panBoundary,
      height.value,
      s,
      minScale,
      safeThreshold
    );
    if (Math.abs(s - scale.value) > EPSILON) {
      cancelAnimation(scale);
      scale.value = s;
    }
    if (width.value > 0 && Math.abs(x - translateX.value) > EPSILON) {
      cancelAnimation(translateX);
      translateX.value = x;
    }
    if (height.value > 0 && Math.abs(y - translateY.value) > EPSILON) {
      cancelAnimation(translateY);
      translateY.value = y;
    }
  }, [
    height,
    maxScale,
    minScale,
    panBoundary,
    panning,
    pinching,
    safeThreshold,
    scale,
    translateX,
    translateY,
    width,
  ]);

  const applyTransform = useCallback(
    (s: number, x: number, y: number, animated: boolean) => {
      const targetScale = clamp(s, minScale, maxScale);
      const tx = clampTranslate(
        x,
        panBoundary,
        width.value,
        targetScale,
        minScale,
        safeThreshold
      );
      const ty = clampTranslate(
        y,
        panBoundary,
        height.value,
        targetScale,
        minScale,
        safeThreshold
      );
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      if (animated) {
        scale.value = zoomTiming(targetScale);
        translateX.value = zoomTiming(tx);
        translateY.value = zoomTiming(ty);
      } else {
        scale.value = targetScale;
        translateX.value = tx;
        translateY.value = ty;
      }
    },
    [
      height,
      maxScale,
      minScale,
      panBoundary,
      safeThreshold,
      scale,
      translateX,
      translateY,
      width,
    ]
  );

  // Ref calls made before the first layout are replayed once the size is known
  // (otherwise the translation would be clamped against a 0×0 container).
  const laidOut = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const whenLaidOut = useCallback((call: () => void) => {
    if (laidOut.current) {
      call();
    } else {
      pending.current = call;
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setValues: ({ scale: nextScale, translate } = {}) =>
        whenLaidOut(() =>
          applyTransform(
            finiteOr(nextScale, scale.value),
            finiteOr(translate?.x, translateX.value),
            finiteOr(translate?.y, translateY.value),
            false
          )
        ),
      zoomTo: (nextScale, options) =>
        whenLaidOut(() => {
          const s = scale.value;
          const target = clamp(finiteOr(nextScale, s), minScale, maxScale);
          if (options?.focal) {
            const fx = options.focal.x - centerX.value;
            const fy = options.focal.y - centerY.value;
            applyTransform(
              target,
              translateForFocal(fx, fx, target, s, translateX.value),
              translateForFocal(fy, fy, target, s, translateY.value),
              options.animated ?? true
            );
          } else {
            // keep the point at the center of the container in place
            const ratio = s > 0 ? target / s : 1;
            applyTransform(
              target,
              translateX.value * ratio,
              translateY.value * ratio,
              options?.animated ?? true
            );
          }
        }),
      reset: (options) =>
        whenLaidOut(() =>
          applyTransform(initialScale, 0, 0, options?.animated ?? true)
        ),
      getValues: () => ({
        scale: scale.value,
        translate: { x: translateX.value, y: translateY.value },
      }),
    }),
    [
      applyTransform,
      centerX,
      centerY,
      initialScale,
      maxScale,
      minScale,
      scale,
      translateX,
      translateY,
      whenLaidOut,
    ]
  );

  const handleLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      width.value = layout.width;
      height.value = layout.height;
      centerX.value = layout.x + layout.width / 2;
      centerY.value = layout.y + layout.height / 2;
      if (!laidOut.current) {
        laidOut.current = true;
        const call = pending.current;
        pending.current = null;
        call?.();
      }
    },
    [centerX, centerY, height, width]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const { outer, inner, animated } = useMemo(
    () => partitionStyle(style),
    [style]
  );

  // A nested GestureHandlerRootView behaves like a plain view under the app's
  // root view (Android logs that it is "already enabled"); on its own, inside
  // a React Native <Modal>, it is what lets Android deliver the gestures.
  return (
    <GestureHandlerRootView style={outer} testID={testID}>
      <GestureDetector gesture={gesture}>
        <View style={styles.fill} collapsable={false}>
          <Animated.View
            onLayout={handleLayout}
            style={[styles.fill, inner, ...animated, animatedStyle]}
          >
            {children}
          </Animated.View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  fill: {
    flexGrow: 1,
  },
});

/**
 * Pinch-to-zoom, pan and (optionally) double-tap-to-zoom container.
 * All gesture handling runs on the UI thread.
 */
export const Zoomable = forwardRef<ZoomableRef, ZoomableProps>(
  ZoomableComponent
);
Zoomable.displayName = 'Zoomable';
