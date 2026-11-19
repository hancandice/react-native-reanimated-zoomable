// Type-level tests (checked by `yarn typecheck` and `yarn typecheck:min`).
import { useRef } from 'react';
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Zoomable, type ZoomableRef } from '../index';

export function AnimatedStyleIsAccepted() {
  const opacity = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const ref = useRef<ZoomableRef>(null);
  return (
    <Zoomable
      ref={ref}
      style={[{ flex: 1, overflow: 'hidden' }, animated]}
      onTransform={(t) => {
        'worklet';
        opacity.value = 1 / t.scale;
      }}
      onSingleTap={({ x, y }) => x + y}
    />
  );
}
