# Changelog

## 1.0.0

Rewrite on Reanimated worklets and Gesture Handler. All gesture handling and animation runs on the UI thread.

### Breaking

- `react-native-reanimated` moved from `dependencies` to `peerDependencies` (`>=3.16.0 <5`).
- New peer dependency `react-native-gesture-handler` (`>=2.20.0 <4`). Your app must be wrapped in
  `GestureHandlerRootView`.
- `panBoundary` defaults to `'content'` (0.x behaved like `'threshold'`).
- Releases spring back inside the boundary and flings use decay momentum (the 0.x "overshooting" drift is gone).

### Deprecated (still work, one-time `__DEV__` warning)

- `threshold` → `panThreshold`, `shouldCenterAfterThreshold` → `centerOnRelease`,
  `disablePanResponderReleaseAction` → `releaseAnimation={false}`, `disableOvershooting` → `momentum={false}`.

### Added

- `minScale`, `panBoundary` (`'content' | 'threshold' | 'none'`), `doubleTapToZoom`, `doubleTapScale`
  (default `min(maxScale, 2.5 × initialScale)`), `panRequiresZoom` for `ScrollView`s and pagers.
- `onSingleTap` (waits for double-tap failure), `onDoubleTap`, `onTransform` (UI-thread worklet),
  `onInteractionStart`, `onInteractionEnd`, `testID`.
- Ref methods `zoomTo()`, `reset()`, `getValues()`; ref calls made before the first layout are queued.
- Springs (`damping 26, stiffness 260`) for settles, 280 ms `bezier(0.2, 0, 0, 1)` for double tap / `zoomTo`,
  decay with rubber band (`0.998`, factor `0.6`), iOS rubber-band curve while dragging past the edges,
  `ReduceMotion.System` everywhere.
- `style` accepts Reanimated animated styles; `overflow` and border radius are applied to the
  untransformed container so `overflow: 'hidden'` clips.
- ESM + CommonJS builds with `exports`, `sideEffects: false`, strict TypeScript with JSDoc,
  `yarn typecheck:min` (Reanimated 3.16 / Gesture Handler 2.20 / React 18), CI workflow.
- Expo SDK 58 example app (React Native 0.88, New Architecture) with a photo-viewer showcase.

### Fixed

- Pinch zoomed around a drifting point; the content under the fingers now stays under the fingers.
- Lifting one finger at the end of a pinch made the content jump (Android); a pan → pinch → lift
  sequence made it jump on iOS.
- A cancelled pan still flung the content.
- A symmetric pinch was reported as a single tap.
- `style.transform` silently disabled zooming; `setValues()` mutated its argument; the view measured
  itself on every render.
- Works inside React Native `<Modal>` on Android (a nested `GestureHandlerRootView` is rendered internally).
- Translation is re-clamped when the container size (rotation, children layout) or the scale limits change.

## 0.2.21

Last release of the PanResponder implementation.
