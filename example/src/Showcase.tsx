import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type ImageSourcePropType,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Zoomable,
  type ZoomableTransformFrame,
} from 'react-native-reanimated-zoomable';

const PHOTOS: { source: ImageSourcePropType; author: string }[] = [
  {
    source: require('../assets/photo-1015.jpg'),
    author: 'Alexey Topolyanskiy',
  },
  { source: require('../assets/photo-1043.jpg'), author: 'Christian Joudrey' },
  { source: require('../assets/photo-1025.jpg'), author: 'Matthew Wiebe' },
];

/** Full-bleed, black photo viewer: tap toggles the chrome, zooming hides it. */
function PhotoViewer({
  index,
  onClose,
}: {
  index: number;
  onClose: () => void;
}) {
  const photo = PHOTOS[index]!;
  const [chrome, setChrome] = useState(true);
  const zoomed = useSharedValue(0);

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: withTiming(chrome && zoomed.value === 0 ? 1 : 0, {
      duration: 180,
    }),
  }));

  return (
    <SafeAreaProvider>
      <View style={styles.viewer}>
        <StatusBar style="light" />
        <Zoomable
          style={styles.viewerZoomable}
          maxScale={5}
          doubleTapToZoom
          onSingleTap={() => setChrome((c) => !c)}
          onTransform={(t: ZoomableTransformFrame) => {
            'worklet';
            zoomed.value = t.scale > 1.02 ? 1 : 0;
          }}
          testID="viewer"
        >
          <Image
            source={photo.source}
            style={styles.fill}
            resizeMode="contain"
          />
        </Zoomable>
        <Animated.View
          pointerEvents={chrome ? 'box-none' : 'none'}
          style={[StyleSheet.absoluteFill, chromeStyle]}
        >
          <SafeAreaView style={styles.viewerChrome} pointerEvents="box-none">
            <View style={styles.viewerBar}>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                hitSlop={12}
              >
                <Text style={styles.viewerClose}>Close</Text>
              </Pressable>
              <Text style={styles.viewerCount}>
                {index + 1} / {PHOTOS.length}
              </Text>
            </View>
            <Text style={styles.viewerCredit}>
              Photo: {photo.author} / Unsplash
            </Text>
          </SafeAreaView>
        </Animated.View>
      </View>
    </SafeAreaProvider>
  );
}

export function Showcase() {
  const dark = useColorScheme() === 'dark';
  const [viewer, setViewer] = useState<number | null>(null);
  const c = dark ? darkColors : lightColors;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={styles.feed}
      >
        <Text style={[styles.heading, { color: c.text }]}>Feed</Text>
        <Text style={[styles.hint, { color: c.muted }]}>
          Pinch a photo, double tap to zoom, tap to open the viewer. The feed
          keeps scrolling while photos are not zoomed.
        </Text>
        {PHOTOS.map((photo, i) => (
          <View key={i} style={[styles.card, { backgroundColor: c.card }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.avatar, { backgroundColor: c.avatar }]} />
              <Text style={[styles.cardAuthor, { color: c.text }]}>
                {photo.author}
              </Text>
            </View>
            <Zoomable
              style={styles.cardPhoto}
              maxScale={4}
              doubleTapToZoom
              panRequiresZoom
              onSingleTap={() => setViewer(i)}
              testID={`feed-photo-${i}`}
            >
              <Image source={photo.source} style={styles.fill} />
            </Zoomable>
            <Text style={[styles.cardCaption, { color: c.muted }]}>
              Unsplash · tap to open
            </Text>
          </View>
        ))}
      </ScrollView>
      <Modal
        visible={viewer != null}
        animationType="fade"
        onRequestClose={() => setViewer(null)}
        statusBarTranslucent
      >
        {viewer != null && (
          <PhotoViewer index={viewer} onClose={() => setViewer(null)} />
        )}
      </Modal>
    </>
  );
}

const lightColors = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  text: '#1C1C1E',
  muted: '#6C6C70',
  avatar: '#C7C7CC',
};
const darkColors = {
  bg: '#000000',
  card: '#1C1C1E',
  text: '#F2F2F7',
  muted: '#8E8E93',
  avatar: '#48484A',
};

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  feed: { padding: 16, gap: 16 },
  heading: { fontSize: 28, fontWeight: '700' },
  hint: { fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 16, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  cardAuthor: { fontSize: 15, fontWeight: '600' },
  cardPhoto: { width: '100%', aspectRatio: 1.5, overflow: 'hidden' },
  cardCaption: { fontSize: 13, padding: 12 },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerZoomable: { flex: 1, justifyContent: 'center' },
  viewerChrome: { flex: 1, justifyContent: 'space-between' },
  viewerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewerClose: { color: '#fff', fontSize: 17, fontWeight: '600' },
  viewerCount: { color: '#fff', fontSize: 15, opacity: 0.8 },
  viewerCredit: {
    color: '#fff',
    opacity: 0.7,
    fontSize: 13,
    textAlign: 'center',
    paddingBottom: 12,
  },
});
