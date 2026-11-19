import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
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

export interface ZoomableRef {
  /**
   * Immediately sets the scale and/or translation (no animation).
   * Values are clamped to `[minScale, maxScale]` and to the pan boundary.
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
   * position, transform, opacity) stay on the untransformed container;
   * everything else (background, padding, alignment of the children, …) is
   * applied to the zoomed content.
   */
  style?: StyleProp<ViewStyle>;
  /** Scale on mount and after `reset()`. @default 1 */
  initialScale?: number;
  /** Smallest scale reachable with a pinch. @default initialScale */
  minScale?: number;
  /** Largest scale reachable with a pinch. @default initialScale * 2 */
  maxScale?: number;
  /**
   * Maximum translation in points (at `minScale`) when `panBoundary` is
   * `'threshold'`. The allowed distance grows with the zoom factor.
   * @default 300
   */
  threshold?: number;
  /**
   * How far the content can be dragged:
   * - `'threshold'` – up to `threshold * scale / minScale` points (classic behavior)
   * - `'content'` – never reveal empty space inside the container edges
   *   (photo-viewer behavior)
   * - `'none'` – unlimited
   * @default 'threshold'
   */
  panBoundary?: PanBoundary;
  /** Disables all gestures. @default false */
  disabled?: boolean;
  /**
   * When the content is released beyond the boundary, animate it back to the
   * center instead of to the boundary. @default false
   */
  shouldCenterAfterThreshold?: boolean;
  /**
   * Skip the release animations (boundary snap-back and momentum). The scale
   * is still brought back inside `[minScale, maxScale]`. @default false
   */
  disablePanResponderReleaseAction?: boolean;
  /** Disables momentum (fling) after a pan is released. @default false */
  disableOvershooting?: boolean;
  /**
   * Double tap zooms in to `doubleTapScale` at the tapped point, or back to
   * `initialScale` when already zoomed. @default false
   */
  doubleTapToZoom?: boolean;
  /** Target scale of a double tap. @default maxScale */
  doubleTapScale?: number;
  /**
   * Only allow one-finger panning while zoomed in. Use it inside a
   * `ScrollView`, pager or bottom sheet so that the parent keeps receiving
   * drags while the content is not zoomed. @default false
   */
  panRequiresZoom?: boolean;
  /** Called on the JS thread when a pinch, pan or double tap begins. */
  onInteractionStart?: () => void;
  /**
   * Called on the JS thread when an interaction ends, with the transform the
   * content settles to.
   */
  onInteractionEnd?: (transform: ZoomableTransform) => void;
  /** Used to locate this view in end-to-end tests. */
  testID?: string;
}

const EPSILON = 0.001;
const SETTLE_DURATION = 220;
const ZOOM_DURATION = 260;
const SCALE_RUBBER_BAND = 0.35;
const PAN_SLOP = 10;
const DECELERATION = 0.997;

const timing = (toValue: number, duration: number) => {
  'worklet';
  return withTiming(toValue, { duration, easing: Easing.out(Easing.cubic) });
};

const isAnimatedStyle = (style: unknown): boolean =>
  typeof style === 'object' && style !== null && 'viewDescriptors' in style;

/** Separates plain style objects (which are split) from Reanimated styles. */
const partitionStyle = (style: StyleProp<ViewStyle>) => {
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

const ZoomableComponent = (
  {
    children,
    style,
    initialScale: initialScaleProp,
    minScale: minScaleProp,
    maxScale: maxScaleProp,
    threshold = 300,
    panBoundary = 'threshold',
    disabled = false,
    shouldCenterAfterThreshold = false,
    disablePanResponderReleaseAction = false,
    disableOvershooting = false,
    doubleTapToZoom = false,
    doubleTapScale: doubleTapScaleProp,
    panRequiresZoom = false,
    onInteractionStart,
    onInteractionEnd,
    testID,
  }: ZoomableProps,
  ref: ForwardedRef<ZoomableRef>
) => {
  const {
    initial: initialScale,
    min: minScale,
    max: maxScale,
  } = normalizeScales(initialScaleProp, minScaleProp, maxScaleProp);
  const doubleTapScale = clamp(
    doubleTapScaleProp ?? maxScale,
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

  // gesture bookkeeping (UI thread only)
  const startScale = useSharedValue(1);
  const startRawScale = useSharedValue(1);
  const rawScale = useSharedValue(1);
  const startPinch = useSharedValue(1);
  const pointerCount = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);
  const lastFocalX = useSharedValue(0);
  const lastFocalY = useSharedValue(0);
  const pinching = useSharedValue(false);
  const panning = useSharedValue(false);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);

  // Latest callbacks, so that inline functions do not rebuild the gestures.
  const listeners = useRef({ onInteractionStart, onInteractionEnd });
  listeners.current = { onInteractionStart, onInteractionEnd };

  const emitStart = useCallback(() => {
    listeners.current.onInteractionStart?.();
  }, []);

  const emitEnd = useCallback((s: number, x: number, y: number) => {
    listeners.current.onInteractionEnd?.({ scale: s, translate: { x, y } });
  }, []);

  const hasStartListener = onInteractionStart != null;
  const hasEndListener = onInteractionEnd != null;

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

    const limit = (length: number, s: number, t: number) => {
      'worklet';
      return maxTranslate(panBoundary, length, s, minScale, t);
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
        scale.value = timing(targetScale, SETTLE_DURATION);
      }

      if (disablePanResponderReleaseAction) {
        if (scaleChanged) {
          translateX.value = timing(x, SETTLE_DURATION);
          translateY.value = timing(y, SETTLE_DURATION);
        }
        notifyEnd(targetScale, x, y);
        return;
      }

      const limitX = limit(width.value, targetScale, safeThreshold);
      const limitY = limit(height.value, targetScale, safeThreshold);
      const overflow =
        Math.abs(x) > limitX + EPSILON || Math.abs(y) > limitY + EPSILON;

      if (overflow) {
        if (shouldCenterAfterThreshold) {
          x = 0;
          y = 0;
        } else {
          x = clamp(x, -limitX, limitX);
          y = clamp(y, -limitY, limitY);
        }
        translateX.value = timing(x, SETTLE_DURATION);
        translateY.value = timing(y, SETTLE_DURATION);
      } else if (
        !disableOvershooting &&
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
              })
            : withDecay({ velocity, deceleration: DECELERATION });
        };
        translateX.value = decay(velocityX, limitX);
        translateY.value = decay(velocityY, limitY);
        // resting point of the decay: v * k / (1 - k) ms with k per-ms friction
        const travel = DECELERATION / (1 - DECELERATION) / 1000;
        x = clamp(x + velocityX * travel, -limitX, limitX);
        y = clamp(y + velocityY * travel, -limitY, limitY);
      } else if (scaleChanged) {
        translateX.value = timing(x, SETTLE_DURATION);
        translateY.value = timing(y, SETTLE_DURATION);
      }

      notifyEnd(targetScale, x, y);
    };

    /** (Re)anchors the pinch so that a change of pointers does not jump. */
    const anchorPinch = (
      focalX: number,
      focalY: number,
      pinchScale: number,
      pointers: number
    ) => {
      'worklet';
      startScale.value = scale.value;
      startRawScale.value = rawScale.value;
      startPinch.value = pinchScale > 0 ? pinchScale : 1;
      startX.value = translateX.value;
      startY.value = translateY.value;
      startFocalX.value = focalX - centerX.value;
      startFocalY.value = focalY - centerY.value;
      lastFocalX.value = startFocalX.value;
      lastFocalY.value = startFocalY.value;
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
        rawScale.value = (startRawScale.value * e.scale) / startPinch.value;
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
          startFocalX.value,
          s,
          startScale.value,
          startX.value
        );
        let y = translateForFocal(
          fy,
          startFocalY.value,
          s,
          startScale.value,
          startY.value
        );
        if (panBoundary === 'content') {
          const cs = clamp(s, minScale, maxScale);
          x = rubberBand(x, limit(width.value, cs, 0));
          y = rubberBand(y, limit(height.value, cs, 0));
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
        if (!panning.value) {
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
        if (scale.value > minScale + EPSILON) {
          manager.activate();
        } else {
          manager.fail();
        }
      })
      .onStart(() => {
        'worklet';
        if (pinching.value) {
          return;
        }
        notifyStart();
        stopAnimations();
        panning.value = true;
        startX.value = translateX.value;
        startY.value = translateY.value;
      })
      .onUpdate((e) => {
        'worklet';
        if (!panning.value || pinching.value) {
          return;
        }
        let x = startX.value + e.translationX;
        let y = startY.value + e.translationY;
        if (panBoundary === 'content') {
          const s = scale.value;
          x = rubberBand(x, limit(width.value, s, 0));
          y = rubberBand(y, limit(height.value, s, 0));
        }
        translateX.value = x;
        translateY.value = y;
      })
      .onEnd((e) => {
        'worklet';
        if (!panning.value || pinching.value) {
          return;
        }
        panning.value = false;
        settle(e.velocityX, e.velocityY);
      })
      .onFinalize(() => {
        'worklet';
        if (panning.value) {
          // cancelled (e.g. a second finger turned it into a pinch)
          panning.value = false;
          if (!pinching.value) {
            settle(0, 0);
          }
        }
      });

    const doubleTap = Gesture.Tap()
      .enabled(!disabled && doubleTapToZoom)
      .numberOfTaps(2)
      .maxDistance(24)
      .onEnd((e, success) => {
        'worklet';
        if (!success || pinching.value || panning.value) {
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
        scale.value = timing(targetScale, ZOOM_DURATION);
        translateX.value = timing(x, ZOOM_DURATION);
        translateY.value = timing(y, ZOOM_DURATION);
        notifyEnd(targetScale, x, y);
      });

    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [
    centerX,
    centerY,
    disableOvershooting,
    disablePanResponderReleaseAction,
    disabled,
    doubleTapScale,
    doubleTapToZoom,
    emitEnd,
    emitStart,
    hasEndListener,
    hasStartListener,
    height,
    initialScale,
    lastFocalX,
    lastFocalY,
    maxScale,
    minScale,
    panBoundary,
    panRequiresZoom,
    panning,
    pinching,
    safeThreshold,
    scale,
    shouldCenterAfterThreshold,
    startFocalX,
    startFocalY,
    startScale,
    startRawScale,
    rawScale,
    startPinch,
    pointerCount,
    startX,
    startY,
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

  // Keep the scale valid when the limits change.
  useEffect(() => {
    if (pinching.value || panning.value) {
      return;
    }
    const s = scale.value;
    const next = clamp(s, minScale, maxScale);
    if (Math.abs(next - s) > EPSILON) {
      cancelAnimation(scale);
      scale.value = next;
    }
  }, [maxScale, minScale, panning, pinching, scale]);

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
        scale.value = timing(targetScale, ZOOM_DURATION);
        translateX.value = timing(tx, ZOOM_DURATION);
        translateY.value = timing(ty, ZOOM_DURATION);
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

  useImperativeHandle(
    ref,
    () => ({
      setValues: ({ scale: nextScale, translate } = {}) => {
        applyTransform(
          finiteOr(nextScale, scale.value),
          finiteOr(translate?.x, translateX.value),
          finiteOr(translate?.y, translateY.value),
          false
        );
      },
      zoomTo: (nextScale, options) => {
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
      },
      reset: (options) => {
        applyTransform(initialScale, 0, 0, options?.animated ?? true);
      },
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
    ]
  );

  const handleLayout = useCallback(
    ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      width.value = layout.width;
      height.value = layout.height;
      centerX.value = layout.x + layout.width / 2;
      centerY.value = layout.y + layout.height / 2;
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

  // A nested GestureHandlerRootView is a plain View when an outer one exists;
  // it makes gestures work inside <Modal> on Android without extra setup.
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

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

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
