import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Zoomable,
  type PanBoundary,
  type ZoomableRef,
  type ZoomableTransform,
} from 'react-native-reanimated-zoomable';

const COLORS = [
  '#ef476f',
  '#f78c6b',
  '#ffd166',
  '#06d6a0',
  '#118ab2',
  '#073b4c',
  '#8338ec',
  '#3a86ff',
];

function Grid() {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const i = row * 4 + col;
      cells.push(
        <View
          key={i}
          style={[styles.cell, { backgroundColor: COLORS[(row + col) % 8] }]}
        >
          <Text style={styles.cellText}>
            {String.fromCharCode(65 + row)}
            {col + 1}
          </Text>
        </View>
      );
    }
  }
  return <View style={styles.grid}>{cells}</View>;
}

function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

const BOUNDARIES: PanBoundary[] = ['content', 'threshold', 'none'];

function Demo({ onClose }: { onClose?: () => void }) {
  const ref = useRef<ZoomableRef>(null);
  const [boundary, setBoundary] = useState<PanBoundary>('content');
  const [doubleTap, setDoubleTap] = useState(true);
  const [last, setLast] = useState<ZoomableTransform | null>(null);
  const [modal, setModal] = useState(false);

  const onEnd = useCallback((t: ZoomableTransform) => setLast(t), []);

  return (
    <View style={styles.demo}>
      <View style={styles.row}>
        <Button title="Reset" onPress={() => ref.current?.reset()} />
        <Button title="Zoom 2x" onPress={() => ref.current?.zoomTo(2)} />
        <Button
          title="Zoom 3x @A1"
          onPress={() => ref.current?.zoomTo(3, { focal: { x: 40, y: 40 } })}
        />
        <Button
          title={`bounds: ${boundary}`}
          onPress={() =>
            setBoundary(
              (b) =>
                BOUNDARIES[(BOUNDARIES.indexOf(b) + 1) % BOUNDARIES.length]!
            )
          }
        />
        <Button
          title={`double tap: ${doubleTap ? 'on' : 'off'}`}
          onPress={() => setDoubleTap((d) => !d)}
        />
        {onClose ? (
          <Button title="Close modal" onPress={onClose} />
        ) : (
          <Button title="Open in Modal" onPress={() => setModal(true)} />
        )}
      </View>
      <Text style={styles.status} testID="status">
        {last
          ? `scale ${last.scale.toFixed(2)} · x ${last.translate.x.toFixed(
              0
            )} · y ${last.translate.y.toFixed(0)}`
          : 'pinch, drag or double tap the grid'}
      </Text>
      <View style={styles.frame}>
        <Zoomable
          ref={ref}
          style={styles.zoomable}
          maxScale={4}
          panBoundary={boundary}
          doubleTapToZoom={doubleTap}
          doubleTapScale={2.5}
          onInteractionEnd={onEnd}
          testID="zoomable"
        >
          <Grid />
        </Zoomable>
      </View>
      {!onClose && (
        <Modal
          visible={modal}
          animationType="slide"
          onRequestClose={() => setModal(false)}
        >
          {/* No GestureHandlerRootView here on purpose: Zoomable handles it. */}
          <SafeAreaView style={styles.flex}>
            <Text style={styles.title}>Inside a React Native Modal</Text>
            <Demo onClose={() => setModal(false)} />
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

function ScrollDemo() {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Inside a ScrollView (panRequiresZoom)</Text>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.scrollFrame}>
          <Zoomable
            style={styles.zoomable}
            maxScale={3}
            panBoundary="content"
            panRequiresZoom
            doubleTapToZoom
          >
            <Grid />
          </Zoomable>
        </View>
      ))}
    </ScrollView>
  );
}

export default function App() {
  const [tab, setTab] = useState<'demo' | 'scroll'>('demo');
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.flex}>
          <StatusBar style="dark" />
          <View style={styles.tabs}>
            <Button title="Demo" onPress={() => setTab('demo')} />
            <Button title="ScrollView" onPress={() => setTab('scroll')} />
          </View>
          {tab === 'demo' ? (
            <>
              <Text style={styles.title}>react-native-reanimated-zoomable</Text>
              <Demo />
            </>
          ) : (
            <ScrollDemo />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fafafa' },
  tabs: { flexDirection: 'row', gap: 8, padding: 8 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 8,
  },
  demo: { flex: 1 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 8,
  },
  button: {
    backgroundColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pressed: { opacity: 0.6 },
  buttonText: { color: 'white', fontWeight: '600' },
  status: { textAlign: 'center', marginVertical: 8, color: '#444' },
  frame: {
    flex: 1,
    margin: 8,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#ddd',
  },
  zoomable: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grid: { width: 320, height: 320, flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { color: 'white', fontWeight: '800', fontSize: 20 },
  scroll: { paddingBottom: 40 },
  scrollFrame: {
    height: 360,
    margin: 8,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#ddd',
  },
});
