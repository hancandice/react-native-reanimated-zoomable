# React Native Reanimated Zoomable 🌟

This Pure TypeScript component offers optimized performance and full customization capabilities, allowing for **zooming** and **dragging** functionalities for its child components. 🚀 It seamlessly operates on both **Android** and **iOS** platforms. 📱

## Features ✨
* **Optimized Performance**: Built with performance in mind to ensure smooth zooming and dragging even with complex UI components.
* **Full Customization**: Highly customizable to fit your application's specific requirements.
* **Cross-Platform Compatibility**: Works flawlessly on both Android and iOS platforms.
* **Responsive**: Provides a responsive user experience, adapting to various screen sizes and orientations.
* **Programmatic Control**: Offers methods to programmatically control the zooming and dragging behavior of the view.

## Installation 📦

```sh
npm install react-native-reanimated-zoomable
```
```sh
yarn add react-native-reanimated-zoomable
```


## Preview 🦋

<p align="center">
<img src="https://github.com/githuboftigran/rn-range-slider/assets/64334381/67a30692-9445-457d-a904-6d3bb67c930b" width="369">
</p>


## Requirements 📚

| Name                 | version                   |    
|----------------------|:-------------------------------------------------:|
| `react-native-reanimated`                | >= 3.5.0       |

## Interfaces and Types 🛠️

- `ZoomableRef`: An interface defining the methods available on the ref for controlling the zoomable view.
- `ZoomableProps`: A set of props that can be passed to the `Zoomable` component. 📝


## Ref 🔍

`react-native-reanimated-zoomable` exposes a ref that allows you to programmatically control the zooming and dragging behavior of the view.

### Methods 🛠️
```
setValues(values: { scale?: number, translate?: { x: number, y: number } }): void
```
Sets the scale and translation values of the view.

- `scale`: (Optional) New scale value for the view.
- `translate`: (Optional) New translation values (x, y) for the view. 🖼️

## Usage 🚀

```jsx
import { Zoomable, ZoomableRef } from 'react-native-reanimated-zoomable';
import { View, Text, Button } from 'react-native';
import React, { createRef } from 'react';

const zoomableRef = createRef<ZoomableRef>();
const INITIAL_ZOOM = 1.5; // Initial zoom scale value

export const setToInitialZoomableSetup = () => {
  zoomableRef.current?.setValues({ scale: INITIAL_ZOOM, translate: { x: 0, y: 0 } });
};

const App = () => {
  const handleResetZoom = () => {
    setToInitialZoomableSetup();
  };

  return (
    <View style={{ flex: 1 }}>
      <Zoomable
        ref={zoomableRef}
        style={{ flex: 1 }}
        initialScale={INITIAL_ZOOM}
        disablePanResponderReleaseAction={true}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Zoomable and Draggable View</Text>
        </View>
      </Zoomable>
      <Button title="Reset Zoom" onPress={handleResetZoom} />
    </View>
  );
};

export default App;
```

### Props 🎨

| Name                 | Description                                                                                                                                                                                                                                                                                          | Type                                                   |                   Default Value                   |
|----------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------|:-------------------------------------------------:|
| `ref`                | A reference to the `Zoomable` component instance. <br /> This reference allows you to **programmatically control the zooming and dragging behavior of the view**. <br />Using this reference, you can call methods such as **setValues()** to update the scale and translation of the view dynamically.                                                                                                                                                                                                                                                         | `React.Ref<ZoomableRef>`                                              |                  _{ }_                   |
| `style`                | Style object for the container view.                                                                                                                                                                                                                                                                              | ViewStyle                                                 |                  _{ }_                   |
| `initialScale`                | Initial scale value for the view.                                                                                                                                                                                                                                               | number                                                 |                  _**1**_                   |
| `maxScale`           | Maximum allowed scale for the view.                       | number                                                 |                        _**initialScale * 2**_                           |
| `threshold`               | The threshold value specifies the threshold for panning gestures to take effect.<br /> This functionality works **only** when **disablePanResponderReleaseAction** is set to **false(default)**.<br /> If the user attempts to pan the view beyond the specified threshold, the view is translated back to the threshold position with a spring animation.                                                                                                                                                                                                                                                                                  | number                                                 |                        _**560**_                         |
| `disabled`                | Disables the zooming and dragging functionality.                                                                                                                                                                                                                                                                | boolean                                                 |  _**false**_   |
| `disablePanResponderReleaseAction`               | Disables the pan responder release action.                                                                 | boolean                                                 | _**false**_ |


## Troubleshooting ⚒️
### Multiple Versions of Reanimated Were Detected
#### Problem:
This error usually occurs when you have installed different versions of Reanimated in your project.

#### Solution:
Modify your `package.json` file to ensure only one version of Reanimated is used:

* For Yarn: Add the resolutions property.

```json
"resolutions": {
  "react-native-reanimated": "<Reanimated version>"
}
```

* For npm: Add the overrides property.

```json
"overrides": {
  "react-native-reanimated": "<Reanimated version>"
}
```

After updating your `package.json`, make sure to run your package manager again:

* Yarn: 
```sh
yarn install
```
* npm: 
```sh
npm install
```

## Contributions 🤝
Contributions are welcome! If you have any suggestions, feature requests, or bug reports, feel free to open an issue or submit a pull request. Let's make this component even better together! 😃

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
