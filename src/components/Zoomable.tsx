import type { PropsWithChildren, ReactElement, Ref } from 'react';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  NativeTouchEvent,
  PanResponderInstance,
  ViewStyle,
} from 'react-native';
import { PanResponder } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimateStyle,
  type AnimatedStyleProp,
} from 'react-native-reanimated';
import { isAndroid } from '../utils/platform';

export interface ZoomableRef {
  setValues(_: { scale?: number; translate?: { x: number; y: number } }): void;
}

type ZoomableProps = PropsWithChildren<{
  style?: AnimateStyle<ViewStyle>;
  initialScale?: number;
  maxScale?: number;
  threshold?: number;
  disabled?: boolean;
  disablePanResponderReleaseAction?: boolean;
}>;

type TouchPosition = Pick<
  NativeTouchEvent,
  'locationX' | 'locationY' | 'pageX' | 'pageY'
>;

const getDistanceFromTouches = ([
  touch1,
  touch2,
]: NativeTouchEvent[]): number => {
  // Find the distance between the two touches
  return Math.sqrt(
    (touch1!.pageX - touch2!.pageX) ** 2 + (touch1!.pageY - touch2!.pageY) ** 2
  );
};

const getRelativeTouchesCenterPosition = (
  touches: NativeTouchEvent[],
  layout: { width: number; height: number },
  transformCache: { scale: number; translateX: number; translateY: number }
): TouchPosition => {
  // Find the center of the two touches
  // The center is the average of the two touches
  // The center is relative to the view
  const pageX = (touches[0]!.pageX + touches[1]!.pageX) / 2 - layout.width;
  const pageY = (touches[0]!.pageY + touches[1]!.pageY) / 2 - layout.height;

  // Location is relative to the scale and previous position
  return {
    locationX: (pageX - transformCache.translateX) / transformCache.scale,
    locationY: (pageY - transformCache.translateY) / transformCache.scale,
    pageX,
    pageY,
  };
};

const THRESHOLD = 560;
const Zoomable = (
  {
    style,
    initialScale = 1,
    threshold = THRESHOLD,
    maxScale = initialScale * 2,
    disabled = false,
    disablePanResponderReleaseAction = false,
    children,
  }: ZoomableProps,
  ref: Ref<ZoomableRef>
): ReactElement => {
  type Layout = {
    width: number;
    height: number;
  };

  const scale = useSharedValue<number>(initialScale);
  const translateX = useSharedValue<number>(0);
  const translateY = useSharedValue<number>(0);

  const containerView = useRef<Animated.View>();
  const layout = useRef<Layout>();
  const lastTransform = useRef({
    scale: initialScale,
    translateX: 0,
    translateY: 0,
  });
  const initialDistance = useRef<number>();
  const initialTouchesCenter = useRef<TouchPosition>();
  const isZoom = useRef<boolean>(false);

  containerView.current?.measure((_x, _y, width, height) => {
    layout.current = { width, height };
  });

  const [panResponder, setPanResponder] = useState<PanResponderInstance>();

  useEffect(() => {
    setPanResponder(
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, { dx, dy }) => {
          if (disabled) {
            return false;
          }
          // onAndroid, the pan responder should not be set when the gesture is a touch event
          // Because on Android, the touch event of children is not propagated to the parent when the pan responder is already set
          if (isAndroid) {
            const TOUCH_THRESHOLD = 5;
            const isTouchEvent: boolean =
              dx > -TOUCH_THRESHOLD &&
              dx < TOUCH_THRESHOLD &&
              dy > -TOUCH_THRESHOLD &&
              dy < TOUCH_THRESHOLD;
            return !isTouchEvent;
          }
          return true;
        },
        onPanResponderGrant: ({ nativeEvent: { touches } }) => {
          if (layout.current == null) {
            return;
          }
          lastTransform.current = {
            scale: scale.value,
            translateX: translateX.value,
            translateY: translateY.value,
          };
          if (touches.length === 2) {
            initialDistance.current = getDistanceFromTouches(touches);
            initialTouchesCenter.current = getRelativeTouchesCenterPosition(
              touches,
              layout.current,
              lastTransform.current
            );
          } else {
            initialDistance.current = undefined;
          }
        },
        onPanResponderMove: ({ nativeEvent: { touches } }, { dx, dy }) => {
          if (layout.current == null) {
            return;
          }
          if (touches.length === 2) {
            isZoom.current = true;
            if (
              initialDistance.current &&
              initialTouchesCenter.current &&
              layout.current
            ) {
              // When it is a pinch gesture,
              // the scale is the ratio of the current distance to the initial distance
              // then multiplied by the cached scale
              const calculatedScale =
                (getDistanceFromTouches(touches) / initialDistance.current) *
                lastTransform.current.scale;

              // Limit the minimum scale to the initial scale
              // Limit the maximum scale to 2x the initial scale
              const newScale = Math.max(
                initialScale,
                Math.min(maxScale, calculatedScale)
              );
              scale.value = newScale;

              const { pageX, pageY } = getRelativeTouchesCenterPosition(
                touches,
                layout.current,
                {
                  scale: scale.value,
                  translateX: translateX.value,
                  translateY: translateY.value,
                }
              );

              // Translates the specific location of the view (locationX, locationX)
              // to the touched location (pageX, pageY)
              const newTranslateX =
                pageX - initialTouchesCenter.current.locationX * newScale;
              const newTranslateY =
                pageY - initialTouchesCenter.current.locationY * newScale;
              translateX.value = newTranslateX;
              translateY.value = newTranslateY;
            } else {
              initialDistance.current = getDistanceFromTouches(touches);
              initialTouchesCenter.current = getRelativeTouchesCenterPosition(
                touches,
                layout.current,
                {
                  scale: scale.value,
                  translateX: translateX.value,
                  translateY: translateY.value,
                }
              );
            }
          } else if (touches.length === 1) {
            if (initialDistance.current) {
              return;
            }

            // When it is a pan gesture,
            // the translation is the sum of the cached translation and the delta
            const newTranslateX = lastTransform.current.translateX + dx;
            const newTranslateY = lastTransform.current.translateY + dy;
            translateX.value = newTranslateX;
            translateY.value = newTranslateY;
          }
        },
        onPanResponderRelease: (_, { dx, dy }) => {
          if (disablePanResponderReleaseAction) {
            return;
          }
          if (isZoom.current) {
            // if it was a zoom gesture, do not trigger any animation
            isZoom.current = false;
            return;
          }

          const overflowX =
            Math.abs(translateX.value) / (scale.value / initialScale) >
            threshold;
          const overflowY =
            Math.abs(translateY.value) / (scale.value / initialScale) >
            threshold;
          if (overflowX || overflowY) {
            // If the user tries to pan the image out of the threshold,
            // translate it back to the threshold with a spring animation
            const toValue = {
              x: overflowX
                ? Math.sign(translateX.value) *
                  (scale.value / initialScale) *
                  threshold
                : translateX.value,
              y: overflowY
                ? Math.sign(translateY.value) *
                  (scale.value / initialScale) *
                  threshold
                : translateY.value,
            };

            translateX.value = withTiming(toValue.x, {
              duration: 100,
            });
            translateY.value = withTiming(toValue.y, {
              duration: 100,
            });
          } else {
            // If the user pans within the threshold,
            // translate it to the direction of the pan with a slow animation to indicate the end of the gesture
            const toValue = {
              x:
                translateX.value *
                (Math.sign(dx) * Math.sign(translateX.value) > 0 ? 1.1 : 0.9),
              y:
                translateY.value *
                (Math.sign(dy) * Math.sign(translateY.value) > 0 ? 1.1 : 0.9),
            };
            translateX.value = withTiming(toValue.x, {
              duration: 1000,
            });
            translateY.value = withTiming(toValue.y, {
              duration: 1000,
            });
          }
        },
      })
    );
  }, [
    disablePanResponderReleaseAction,
    disabled,
    initialScale,
    maxScale,
    scale,
    threshold,
    translateX,
    translateY,
  ]);

  const animStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    } as AnimatedStyleProp<ViewStyle>;
  }, [scale, translateX, translateY]);

  useImperativeHandle(ref, () => ({
    setValues: ({ scale: customScale, translate }) => {
      if (customScale === null && translate === null) {
        throw new Error('Either scale or translate must be provided');
      }
      const trimmedScale =
        customScale != null
          ? Math.max(initialScale, Math.min(maxScale, customScale))
          : scale.value;
      scale.value = trimmedScale;

      if (translate != null) {
        if (Math.abs(translate.x) / (trimmedScale / initialScale) > threshold) {
          // If the custom translateX is larger than the threshold,
          // reset the translateX to the threshold
          translate.x =
            Math.sign(translate.x) * (trimmedScale / initialScale) * threshold;
        }
        if (Math.abs(translate.y) / (trimmedScale / initialScale) > threshold) {
          // If the custom translateY is larger than the threshold,
          // reset the translateY to the threshold
          translate.y =
            Math.sign(translate.y) * (trimmedScale / initialScale) * threshold;
        }
        translateX.value = translate.x;
        translateY.value = translate.y;
      }
    },
  }));

  return (
    <Animated.View
      ref={(zoomableViewRef) => {
        containerView.current = zoomableViewRef as Animated.View;
      }}
      style={[style, style?.transform ? {} : animStyle]}
      {...panResponder?.panHandlers}
    >
      {children}
    </Animated.View>
  );
};

const ZoomableRoot = forwardRef<ZoomableRef, ZoomableProps>(Zoomable);

export { ZoomableRoot as Zoomable };
