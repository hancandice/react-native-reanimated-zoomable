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

* When `shouldCenterAfterThreshold` is **true** and `disableOvershooting` is **true**
<p align="center">
<img src="https://github.com/hancandice/react-native-reanimated-zoomable/assets/64334381/3f6b9dc9-ddf5-425b-89c3-e2922fa76623" width="369">
</p>

* When `shouldCenterAfterThreshold` is **false** and `disableOvershooting` is **false**
<p align="center">
<img src="https://github.com/hancandice/react-native-reanimated-zoomable/assets/64334381/de6c0f8e-5628-49e2-992b-15e528228349" width="369">
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
const INITIAL_ZOOM = 1; // Initial zoom scale value

export const setToInitialZoomableSetup = () => {
  zoomableRef.current?.setValues({ scale: INITIAL_ZOOM, translate: { x: 0, y: 0 } });
};

const App = () => {
  const handleResetZoom = () => {
    setToInitialZoomableSetup();
  };

  return (
    <View style={{ flex: 1, padding: 10 }}>
      <Zoomable
        ref={zoomableRef}
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        disablePanResponderReleaseAction={false}
        threshold={300}
        shouldCenterAfterThreshold
        disableOvershooting
        initialScale={INITIAL_ZOOM}
        maxScale={4}
      >
        <Image
          source={{ uri: "https://picsum.photos/id/2/1000/1000" }}
          style={{ height: 400, width: 400 }}
        />
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
| `disablePanResponderReleaseAction`               | The `disablePanResponderReleaseAction` prop determines whether certain actions should be taken when the user releases a panning gesture.                                                                 | boolean                                                 | _**false**_ |
| `threshold`               | The threshold here represents a numeric value that defines a limit for how far the user can pan the view before triggering a specific action. <br /> Threshold functionality won't be active if `disablePanResponderReleaseAction` is set to **true**.<br /> If `shouldCenterAfterThreshold` is set to **false** (default) and a user attempts to pan the view beyond the specified threshold, it will spring back to the threshold position. However, if `shouldCenterAfterThreshold` is set to **true**, the view will instead center itself.                                                                                                                                                                                                                                                               | number                                                 |                        _**560**_                         |
| `shouldCenterAfterThreshold`               | The `shouldCenterAfterThreshold` prop determines whether the view should automatically center itself after the user exceeds the specified threshold while panning.                                                                                                                                                                                                                                                               | boolean                                                 |                        _**false**_                         |
| `disableOvershooting`               | The `disableOvershooting` prop controls whether the view should exhibit an overshooting effect when the user releases a panning gesture. <br /> When `disableOvershooting` is set to **true**, the view will not display any overshooting animation after the user releases a panning gesture. This means that the view will come to an immediate stop at the exact point where the user lifts their finger or releases the gesture.                                                                                                                                                                                                                                                              | boolean                                                 |                        _**false**_                         |
| `disabled`               | The `disabled` prop is used to control whether the zooming and panning functionality of a component is enabled or disabled.                                                                                                                                                                                                                                                             | boolean                                                 |                        _**false**_                         |

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
