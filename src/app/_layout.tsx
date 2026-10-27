import WorkoutSync from '@/components/workout-sync';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const { loading, session } = useAuth();
  // Publiczne informacje są dostępne także bez sesji i przez bezpośredni link.
  const isPublicRoute = ['/', '/account', '/about', '/privacy', '/terms'].includes(pathname);


  if (!loading && !session && !isPublicRoute) return <Redirect href="/account"/>;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

export default function TabLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><AuthProvider><WorkoutSync/><RootStack/></AuthProvider></GestureHandlerRootView>;
}
