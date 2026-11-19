# Changelog

## 1.0.0 — unreleased

Rewrite on Reanimated worklets and Gesture Handler. All gesture handling now runs on the UI thread.

### Breaking

- `react-native-reanimated` moved from `dependencies` to `peerDependencies` (≥ 3.16; Reanimated 4 supported).
- New peer dependency: `react-native-gesture-handler` (≥ 2.20; v3 supported). Your app must be wrapped in
  `GestureHandlerRootView`.
- Release behavior: the 0.x "overshooting" drift is replaced by fling momentum; after a pinch the content is
  brought back inside the pan boundary.

### Fixed

- Pinch zoomed around a drifting point; the content under the fingers now stays under the fingers, and moving
  both fingers pans.
- Lifting one finger at the end of a pinch made the content jump (Android).
- `style.transform` silently disabled zooming.
- `setValues()` mutated the object passed to it.
- The view measured itself on every render.
- Works inside React Native `<Modal>` on Android (a nested `GestureHandlerRootView` is rendered internally).
- Translation is re-clamped when the container size changes (rotation, children layout changes) and the scale
  when `minScale`/`maxScale` change.

### Added

- `minScale`, `panBoundary` (`'threshold' | 'content' | 'none'`), `doubleTapToZoom`, `doubleTapScale`,
  `panRequiresZoom` (for `ScrollView`/pagers), `onInteractionStart`, `onInteractionEnd`, `testID`.
- Ref methods `zoomTo()`, `reset()`, `getValues()`.
- Rubber-band resistance when pinching past the scale limits / dragging past content bounds.
- ESM + CommonJS builds with `exports`, `sideEffects: false`, strict TypeScript types with JSDoc.
- Expo SDK 58 example app (React Native 0.88, New Architecture).

## 0.2.21

Last release of the PanResponder implementation.
