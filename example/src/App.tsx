import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Demo, ScrollDemo } from './EdgeCases';
import { Showcase } from './Showcase';

const TABS = ['Showcase', 'Edge cases', 'ScrollView'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const dark = useColorScheme() === 'dark';
  const [tab, setTab] = useState<Tab>('Showcase');
  const bg = tab === 'Showcase' ? (dark ? '#000' : '#F2F2F7') : '#fafafa';

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <SafeAreaView style={[styles.flex, { backgroundColor: bg }]}>
          <StatusBar style={dark && tab === 'Showcase' ? 'light' : 'dark'} />
          <View style={styles.tabs}>
            {TABS.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: t === tab }}
                onPress={() => setTab(t)}
                style={[
                  styles.tab,
                  t === tab && styles.tabActive,
                  dark && tab === 'Showcase' && styles.tabDark,
                  t === tab &&
                    dark &&
                    tab === 'Showcase' &&
                    styles.tabActiveDark,
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    t === tab && styles.tabTextActive,
                    dark && tab === 'Showcase' && styles.tabTextDark,
                    dark &&
                      tab === 'Showcase' &&
                      t === tab &&
                      styles.tabTextActiveDark,
                  ]}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
          {tab === 'Showcase' && <Showcase />}
          {tab === 'Edge cases' && <Demo />}
          {tab === 'ScrollView' && <ScrollDemo />}
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#E5E5EA',
  },
  tabActive: { backgroundColor: '#1C1C1E' },
  tabDark: { backgroundColor: '#2C2C2E' },
  tabActiveDark: { backgroundColor: '#F2F2F7' },
  tabText: { fontWeight: '600', color: '#1C1C1E' },
  tabTextActive: { color: '#fff' },
  tabTextDark: { color: '#F2F2F7' },
  tabTextActiveDark: { color: '#000' },
});
