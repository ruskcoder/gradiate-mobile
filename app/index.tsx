import { useStore } from '@/lib/store';
import { Redirect } from 'expo-router';
import * as React from 'react';

// The zustand store rehydrates from AsyncStorage asynchronously. Redirecting
// before that finishes always sees the initial `currentUserIndex: -1` and
// bounces to /login — which is why a logged-in user kept being asked to log in
// on every cold start. Wait for hydration, then route by the persisted user.
export default function Index() {
  const hydrated = React.useSyncExternalStore(
    useStore.persist.onFinishHydration,
    () => useStore.persist.hasHydrated(),
    () => false // server snapshot: storage never hydrates during static web export
  );

  if (!hydrated) return null;

  const isLoggedIn = useStore.getState().currentUser() !== null;
  return <Redirect href={isLoggedIn ? '/grades' : '/login'} />;
}
