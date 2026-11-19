# react-native-reanimated-zoomable

[![npm](https://img.shields.io/npm/v/react-native-reanimated-zoomable)](https://www.npmjs.com/package/react-native-reanimated-zoomable)
[![license](https://img.shields.io/npm/l/react-native-reanimated-zoomable)](./LICENSE)
[![CI](https://github.com/hancandice/react-native-reanimated-zoomable/actions/workflows/ci.yml/badge.svg)](https://github.com/hancandice/react-native-reanimated-zoomable/actions)

Pinch, pan and double-tap zoom for any view — photo-viewer feel, 100% on the UI thread.

<p align="center">
  <img src="https://raw.githubusercontent.com/hancandice/react-native-reanimated-zoomable/v1.0.0/docs/hero.webp" width="360" alt="Pinching a photo around the fingers, flinging it into the rubber-band edge, and double-tapping to zoom out and in again" />
</p>

```tsx
<Zoomable panBoundary="content" doubleTapToZoom maxScale={4}>
  <Image source={photo} style={{ width: '100%', aspectRatio: 1 }} />
</Zoomable>
```

- Pinch stays anchored under your fingers; two-finger drag pans
- Fling momentum, iOS-style rubber band and spring settle, double tap to zoom at the tapped point
- Plays nicely with `ScrollView`, pagers and bottom sheets (`panRequiresZoom`)
- Works inside `<Modal>` on Android, New Architecture, Expo, Reanimated 3 & 4

## Install

```sh
npx expo install react-native-reanimated-zoomable react-native-reanimated react-native-gesture-handler
```

Bare React Native:

```sh
npm install react-native-reanimated-zoomable react-native-reanimated react-native-gesture-handler
```

Then follow the [Reanimated](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/)
(Reanimated 4 also needs `react-native-worklets`) and
[Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/installation)
setup, and wrap your app in `GestureHandlerRootView`.

| Peer | Range | Verified |
| --- | --- | --- |
| `react-native` | ≥ 0.76 | 0.88 (New Architecture) on Android 14 and iOS 26, Expo SDK 58 |
| `react-native-reanimated` | ≥ 3.16 < 5 | 4.7 on device; 3.16 type-checked (`yarn typecheck:min`) |
| `react-native-gesture-handler` | ≥ 2.20 < 4 | 3.3 on device; 2.20 type-checked |
| `react` | ≥ 18.2 | 19.3 on device; 18 type-checked |

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `style` | `StyleProp<AnimatedStyle<ViewStyle>>` | – | Layout props (size, flex, margin, position, transform, opacity, `overflow`, border radius) stay on the container, so `overflow: 'hidden'` clips the zoomed content. Everything else (background, padding, child alignment…) applies to the content. Animated styles are applied to the content; their `transform` is replaced by the zoom. |
| `initialScale` | `number` | `1` | Scale on mount and after `reset()`. |
| `minScale` | `number` | `initialScale` | Smallest pinch scale. |
| `maxScale` | `number` | `initialScale * 2` | Largest pinch scale (unchanged from 0.x; photo viewers usually want 3–5). Pinching past a limit rubber-bands and springs back. |
| `panBoundary` | `'content' \| 'threshold' \| 'none'` | `'content'` | `content`: never reveal empty space inside the container edges. `threshold`: up to `panThreshold * scale / minScale` points (0.x behaviour). `none`: unlimited. |
| `panThreshold` | `number` | `300` | Max translation (points, at `minScale`) for `panBoundary="threshold"`. |
| `centerOnRelease` | `boolean` | `false` | Released past the boundary → animate back to the center instead of to the boundary. |
| `releaseAnimation` | `boolean` | `true` | Spring back inside the boundary on release. `false` leaves the content where it was released (the scale is still kept within its limits). |
| `momentum` | `boolean` | `true` | Keep moving after a fling (decay with rubber band at the edges). |
| `doubleTapToZoom` | `boolean` | `false` | Double tap zooms to `doubleTapScale` at the tapped point, or back to `initialScale`. |
| `doubleTapScale` | `number` | `min(maxScale, 2.5 × initialScale)` | Target scale of a double tap. |
| `panRequiresZoom` | `boolean` | `false` | One-finger pan only while zoomed in, so a parent `ScrollView`/pager keeps scrolling. |
| `disabled` | `boolean` | `false` | Disable all gestures. |
| `onSingleTap` | `({ x, y }) => void` | – | Single tap (JS thread). Waits until a double tap is ruled out; never fires for a pinch. |
| `onDoubleTap` | `({ x, y }) => void` | – | Double tap (JS thread), with or without `doubleTapToZoom`. |
| `onTransform` | `worklet ({ scale, translateX, translateY }) => void` | – | Called on the **UI thread** on every frame. Must be a worklet. |
| `onInteractionStart` | `() => void` | – | A pinch, pan or double tap starts (JS thread). |
| `onInteractionEnd` | `({ scale, translate: { x, y } }) => void` | – | An interaction ends, with the transform it settles to (JS thread). |
| `testID` | `string` | – | |

Animations use springs (`damping 26, stiffness 260`) and honour the system **Reduce Motion** setting
(`ReduceMotion.System`).

### Ref

```ts
interface ZoomableRef {
  setValues(v: { scale?: number; translate?: { x: number; y: number } }): void; // immediate
  zoomTo(scale: number, opts?: { focal?: { x: number; y: number }; animated?: boolean }): void;
  reset(opts?: { animated?: boolean }): void;
  getValues(): { scale: number; translate: { x: number; y: number } };
}
```

Values are clamped to the scale limits and the pan boundary. `focal` is relative to the top-left
corner of the component. Calls made before the first layout are applied once the size is known.

## Recipes

**Photo viewer with fading chrome** — hide the header while zoomed, without touching the JS thread:

```tsx
const zoomed = useSharedValue(0);
const chrome = useAnimatedStyle(() => ({ opacity: withTiming(zoomed.value ? 0 : 1) }));

<Zoomable
  style={{ flex: 1, backgroundColor: 'black' }}
  maxScale={5}
  doubleTapToZoom
  onSingleTap={toggleChrome}
  onTransform={(t) => {
    'worklet';
    zoomed.value = t.scale > 1.02 ? 1 : 0;
  }}
>
  <Image source={photo} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
</Zoomable>
```

**Inside a feed or pager** — the list keeps scrolling until the user zooms in:

```tsx
<Zoomable style={{ aspectRatio: 1.5, overflow: 'hidden' }} panRequiresZoom doubleTapToZoom>
  <Image source={photo} style={{ width: '100%', height: '100%' }} />
</Zoomable>
```

**Reset when the content changes:** `useEffect(() => ref.current?.reset({ animated: false }), [uri])`.

> **Pressable children and double tap.** Gestures run alongside the touch system, so a `Pressable`
> inside a `Zoomable` with `doubleTapToZoom` receives `onPress` for *each* tap of a double tap.
> Prefer `onSingleTap` on the `Zoomable` for tap actions on zoomable content.

## Migrating from 0.x

1.0 is a rewrite on Gesture Handler and Reanimated worklets (0.x used `PanResponder` on the JS thread).

1. **Peer dependencies.** `react-native-reanimated` is now a peer dependency (it used to be a regular
   dependency, which caused "multiple versions of Reanimated" errors) and `react-native-gesture-handler`
   is a new one. Install both and wrap your app in `GestureHandlerRootView`.
2. **New defaults.** `panBoundary` is now `'content'` (0.x behaved like `'threshold'`) and a double tap
   zooms to `min(maxScale, 2.5 × initialScale)`. Pass `panBoundary="threshold"` to keep the old bounds.
3. **Renamed props** (the old names still work and log a one-time warning in development):

   | 0.x | 1.0 |
   | --- | --- |
   | `threshold` | `panThreshold` |
   | `shouldCenterAfterThreshold` | `centerOnRelease` |
   | `disablePanResponderReleaseAction` | `releaseAnimation={false}` |
   | `disableOvershooting` | `momentum={false}` |

4. **Behaviour.** A pinch keeps the point under the fingers in place and a two-finger drag pans; the
   0.x "overshooting" drift is replaced by fling momentum; releases spring back inside the boundary;
   a `transform` in `style` no longer disables zooming.

## Example app

```sh
yarn
yarn example start   # press a / i, or open it in Expo Go (SDK 58)
```

*Showcase* is a feed with zoomable photos and a full-screen viewer (light and dark mode);
*Edge cases* covers the bound modes, the ref API, tap callbacks and a React Native `<Modal>`;
*ScrollView* shows `panRequiresZoom`. Screenshots from emulator runs are in
[`docs/screenshots`](./docs/screenshots).

## License

MIT · Example photos from [Unsplash](./example/assets/CREDITS.md)
