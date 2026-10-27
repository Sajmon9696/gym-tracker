import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { progresTheme as c } from '@/constants/progres-theme';

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return <View pointerEvents="none" style={styles.overlay} onLayout={() => {
    // Interfejs jest gotowy; ekran startowy nie zależy od zakończenia animacji.
    void SplashScreen.hideAsync().finally(() => setVisible(false));
  }}><AnimatedIcon /></View>;
}

export function AnimatedIcon() {
  return <View style={styles.mark}><Text style={styles.letter}>P</Text></View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  mark: { width: 100, height: 100, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  letter: { color: c.accentInk, fontSize: 64, fontWeight: '900' },
});

