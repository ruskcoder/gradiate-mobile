import { useStore } from '@/lib/store';
import { Redirect } from 'expo-router';
import * as React from 'react';

// The zustand store rehydrates from AsyncStorage asynchronously. Redirecting
// before that finishes always sees the initial `currentUserIndex: -1` and
// bounces to /login — which is why a logged-in user kept being asked to log in
// on every cold start. Wait for hydration, then route by the persisted user.
export default function Index() {
  const [hydrated, setHydrated] = React.useState(() => useStore.persist.hasHydrated());

  React.useEffect(() => {
    if (hydrated) return;
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    // Guard against hydration completing between the initial render and here.
    if (useStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);

  if (!hydrated) return null;

  const isLoggedIn = useStore.getState().currentUser() !== null;
  return <Redirect href={isLoggedIn ? '/grades' : '/login'} />;
}
