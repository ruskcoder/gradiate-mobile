import { Spinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { PLATFORM_MAPPING, type District } from '@/lib/constants';
import { login } from '@/lib/grades-api';
import { usePrimaryForegroundColor } from '@/lib/use-primary-foreground-color';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as NavigationBar from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import {
  FlatList,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

const WALLPAPER = require('@/assets/images/wallpaper.jpg');
const DEFAULT_AVATAR = require('@/assets/images/person.png');

const LOGO_PATH =
  'M242-249q-20-11-31-29.5T200-320v-192l-96-53q-11-6-16-15t-5-20q0-11 5-20t16-15l338-184q9-5 18.5-7.5T480-829q10 0 19.5 2.5T518-819l381 208q10 5 15.5 14.5T920-576v256q0 17-11.5 28.5T880-280q-17 0-28.5-11.5T840-320v-236l-80 44v192q0 23-11 41.5T718-249L518-141q-9 5-18.5 7.5T480-131q-10 0-19.5-2.5T442-141L242-249Zm238-203 274-148-274-148-274 148 274 148Zm0 241 200-108v-151l-161 89q-9 5-19 7.5t-20 2.5q-10 0-20-2.5t-19-7.5l-161-89v151l200 108Zm0-241Zm0 121Zm0 0Z';

const PAGE_DURATION = 450;

// The login card is always light (over the wallpaper), but the shared Button's
// `outline` variant uses theme tokens (`bg-background`/`border-border`) that go
// dark/translucent and don't reliably get overridden by className merging.
// Pin an opaque white shadcn-style surface via inline style instead.
const WHITE_BUTTON = {
  backgroundColor: '#ffffff',
  borderColor: 'rgba(0,0,0,0.12)',
};

function Logo() {
  return (
    <View className="flex-row items-center gap-4">
      <View className="aspect-square items-center justify-center rounded-xl bg-[#9cd0fb] p-1">
        <Svg width={56} height={56} viewBox="0 -960 960 960" fill="#103074">
          <Path d={LOGO_PATH} />
        </Svg>
      </View>
      <Text className="text-4xl font-extrabold tracking-tight text-black">Gradexis</Text>
    </View>
  );
}

/** A lightweight text field — the app has no shared Input component yet, so the
 *  login page styles a plain TextInput to mirror the web's shadcn Input. */
function Field({
  className,
  ...props
}: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor="#6b7280"
      textAlignVertical="center"
      className={cn(
        'w-full rounded-md border border-black/15 bg-white/70 px-3 text-base text-black',
        className
      )}
      style={[
        {
          height: 44,
          paddingVertical: Platform.OS === 'ios' ? 12 : 0,
          lineHeight: Platform.OS === 'ios' ? 20 : undefined,
        },
      ]}
      {...props}
    />
  );
}

/** A district row, used both in the searchable list and as the read-only
 *  summary on the login form page. */
function DistrictRow({
  district,
  onPress,
}: {
  district: District;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={cn(
        'rounded-lg border border-black/15 bg-white/50 p-3',
        onPress && 'active:bg-white/80'
      )}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-base font-semibold text-black" numberOfLines={1}>
          {district.name}
        </Text>
        <Text className="text-xs font-medium text-black/60">
          {PLATFORM_MAPPING[district.platform] ?? district.platform}
        </Text>
      </View>
      <Text className="mt-0.5 text-xs text-black/50" numberOfLines={1}>
        {district.link}
      </Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const spinnerColor = usePrimaryForegroundColor();

  // Set by `handleAuthError` (lib/grades-api.ts) when the current user's
  // session/password is no longer valid. Non-null here means this mount
  // should skip straight to the locked-username credentials page instead of
  // the normal add-account picker flow.
  const reauthUsername = useStore((s) => s.reauthUsername);
  const reauthDistrict = useStore((s) => s.reauthDistrict);
  const setReauthRequired = useStore((s) => s.setReauthRequired);
  const changeUserData = useStore((s) => s.changeUserData);
  // Snapshot at mount rather than tracking the store live — once the user
  // backs out of this flow (to pick a different district/account) it should
  // stay a normal login even though the store field isn't cleared until then.
  const [reauthActive, setReauthActive] = React.useState(() => !!reauthUsername);

  const [page, setPage] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<District | null>(reauthDistrict);
  const [username, setUsername] = React.useState(reauthUsername ?? '');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    reauthActive ? 'Your password has changed. Please log in again.' : null
  );
  const [districts, setDistricts] = React.useState<District[]>([]);
  const [loadingDistricts, setLoadingDistricts] = React.useState(true);

  const cancelReauth = React.useCallback(() => {
    setReauthActive(false);
    setReauthRequired(null);
    setUsername('');
  }, [setReauthRequired]);

  React.useEffect(() => {
    const fetchDistricts = async () => {
      try {
        setLoadingDistricts(true);
        const response = await fetch('https://web.gradexis.app/districts.json');
        if (!response.ok) {
          throw new Error('Failed to fetch districts');
        }
        const data = await response.json();
        setDistricts(data);
      } catch (e) {
        console.error('Error fetching districts:', e);
        setError('Failed to load districts. Please try again.');
      } finally {
        setLoadingDistricts(false);
      }
    };

    fetchDistricts();
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    // With edge-to-edge enabled (app.json `android.edgeToEdge`), the system
    // bars are always transparent/overlaid by default — setPositionAsync and
    // setBackgroundColorAsync are unsupported (and throw) in that mode.
    // Only the button/icon color is still configurable.
    NavigationBar.setButtonStyleAsync('dark');
  }, []);

  // Width of the sliding viewport, measured once laid out.
  const [viewportWidth, setViewportWidth] = React.useState(0);
  // Natural height of each page, measured as it lays out, so the card can
  // grow/shrink smoothly to fit the active page (mirrors the web max-height
  // animation).
  const heights = React.useRef<number[]>([0, 0, 0]);
  const [heightTick, forceHeights] = React.useState(0);

  const translateX = useSharedValue(0);
  const cardHeight = useSharedValue(0);

  const goToPage = React.useCallback(
    (next: number) => {
      setPage(next);
      if (viewportWidth) {
        translateX.value = withTiming(-next * viewportWidth, { duration: PAGE_DURATION });
      }
      const h = heights.current[next];
      if (h) cardHeight.value = withTiming(h, { duration: PAGE_DURATION });
    },
    [viewportWidth, translateX, cardHeight]
  );

  // Reauth entry: snap straight to the credentials page once the viewport is
  // measured, no slide animation — this isn't a user-driven page change, it's
  // where the screen should already "be" on mount.
  React.useEffect(() => {
    if (!reauthActive || !viewportWidth) return;
    if (page !== 2) {
      setPage(2);
      translateX.value = -2 * viewportWidth;
    }
    // Depend on `heightTick` so that once page 2 finishes measuring (its own
    // onLayout won't fire again after the snap, since its content doesn't
    // change) the card locks to the full credentials height instead of staying
    // clipped to whichever page was measured first.
    const h = heights.current[2];
    if (h) cardHeight.value = h;
  }, [reauthActive, viewportWidth, page, heightTick, translateX, cardHeight]);

  const onPageLayout = (index: number) => (h: number) => {
    if (heights.current[index] === h) return;
    heights.current[index] = h;
    // Once the active page's height is known, lock the card to it.
    if (index === page) {
      if (cardHeight.value === 0) cardHeight.value = h;
      else cardHeight.value = withTiming(h, { duration: PAGE_DURATION });
    }
    forceHeights((n) => n + 1);
  };

  const selectDistrict = (d: District) => {
    setSelected(d);
    setUsername('');
    setPassword('');
    setError(null);
    goToPage(2);
    setTimeout(() => setSearch(''), PAGE_DURATION);
  };

  const handleLogin = async () => {
    if (!selected) return;
    setError(null);
    setLoading(true);

    const platform = (selected.platform as 'hac' | 'skyward-legacy') || 'hac';
    const loginType = (selected.loginType as 'credentials' | 'classlink') || 'credentials';

    try {
      const loginDetails = {
        username,
        password,
        link: selected.link,
        clsession: '',
        district: selected.name,
      };
      const data = await login(platform, loginType, loginDetails);

      if (data?.success) {
        if (reauthActive) {
          // Update the existing account's credentials in place — this is the
          // same account re-authenticating, not a new one being added.
          changeUserData('password', password);
          if (data.username) changeUserData('username', data.username);
          setReauthRequired(null);
          setReauthActive(false);
        } else {
          const newIndex = useStore.getState().users.length;
          useStore.getState().addUser({
            loginType,
            username: data.username || username,
            password,
            platform,
            school: data.school || '',
            district: data.district || selected.name,
            link: data.link || selected.link,
            name: data.name || '',
            avatar: DEFAULT_AVATAR,
            premium: data.numReferrals >= 0,
          });
          useStore.getState().setCurrentUserIndex(newIndex);
        }

        router.replace('/grades');
      } else {
        setError('Login failed');
      }
    } catch (e: any) {
      setError(e.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return districts;
    return districts.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (PLATFORM_MAPPING[d.platform] ?? d.platform).toLowerCase().includes(q) ||
        d.link.toLowerCase().includes(q)
    );
  }, [search, districts]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const viewportStyle = useAnimatedStyle(() =>
    cardHeight.value > 0 ? { height: cardHeight.value } : {}
  );

  const canSubmit = !loading && username.length > 0 && password.length > 0;

  return (
    <View style={{ flex: 1 }}>
      {/* Full-bleed background: the root layout skips its usual top-inset
          padding for this route (see app/_layout.tsx), so this can cover
          the status bar area directly without needing to counteract it. */}
      <ImageBackground
        source={WALLPAPER}
        resizeMode="cover"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <BlurView intensity={40} tint="light" style={{ flex: 1 }} />
      </ImageBackground>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={insets.top}>
        <View
          className="flex-1 items-center justify-center px-6"
          style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-white/40 bg-white/40 p-6 shadow-lg shadow-black/10">
            <View className="items-center">
              <Logo />
            </View>

            <View
              className="mt-6 w-full overflow-hidden"
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w && Math.abs(w - viewportWidth) > 0.5) {
                  setViewportWidth(w);
                  translateX.value = -page * w;
                }
              }}>
              <Animated.View style={viewportStyle}>
                <Animated.View
                  className="flex-row"
                  style={[{ width: viewportWidth * 3 }, rowStyle]}>
                  {/* Page 0 — entry */}
                  <View style={{ width: viewportWidth }}>
                    <View
                      className="gap-2"
                      onLayout={(e) => onPageLayout(0)(e.nativeEvent.layout.height)}>
                      <Button
                        variant="outline"
                        className="w-full"
                        style={WHITE_BUTTON}
                        disabled={loadingDistricts}
                        onPress={() => goToPage(1)}>
                        <Text className={cn('text-black', loadingDistricts && 'text-black/40')}>
                          {loadingDistricts ? 'Loading Districts...' : 'Select District'}
                        </Text>
                      </Button>
                      <View className="flex-row gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          style={[WHITE_BUTTON, { opacity: 1 }]}
                          disabled>
                          <Text className="text-black/40">Demo</Text>
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          style={[WHITE_BUTTON, { opacity: 1 }]}
                          disabled>
                          <Text className="text-black/40">Custom</Text>
                        </Button>
                      </View>
                    </View>
                  </View>

                  {/* Page 1 — district picker */}
                  <View style={{ width: viewportWidth }}>
                    <View
                      className="gap-3"
                      onLayout={(e) => onPageLayout(1)(e.nativeEvent.layout.height)}>
                      <Field
                        placeholder="Search District..."
                        value={search}
                        onChangeText={setSearch}
                        autoCorrect={false}
                        autoCapitalize="none"
                      />
                      <View style={{ height: 300 }}>
                        {loadingDistricts ? (
                          <View className="flex-1 items-center justify-center gap-2">
                            <Spinner size="small" color="#000" />
                            <Text className="text-center text-sm text-black/60">
                              Loading districts...
                            </Text>
                          </View>
                        ) : (
                          <FlatList
                            data={filtered}
                            keyExtractor={(d) => d.link + d.name}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            ItemSeparatorComponent={() => <View className="h-2" />}
                            renderItem={({ item }) => (
                              <DistrictRow district={item} onPress={() => selectDistrict(item)} />
                            )}
                            ListEmptyComponent={
                              <Text className="py-2 text-center text-black/50">
                                No districts found.
                              </Text>
                            }
                          />
                        )}
                      </View>
                      <Button
                        variant="outline"
                        className="w-full"
                        style={WHITE_BUTTON}
                        onPress={() => goToPage(0)}>
                        <Text className="text-black">Back</Text>
                      </Button>
                    </View>
                  </View>

                  {/* Page 2 — credentials */}
                  <View style={{ width: viewportWidth }}>
                    <View
                      className="gap-4"
                      onLayout={(e) => onPageLayout(2)(e.nativeEvent.layout.height)}>
                      {selected && <DistrictRow district={selected} />}
                      {error && (
                        <Text className="text-center text-sm text-red-600">{error}</Text>
                      )}
                      <View className="gap-2">
                        <Text className="text-sm font-medium text-black">Username</Text>
                        <Field
                          placeholder="Username"
                          value={username}
                          onChangeText={setUsername}
                          autoCapitalize="none"
                          autoCorrect={false}
                          editable={!reauthActive}
                          className={reauthActive ? 'opacity-50' : undefined}
                        />
                      </View>
                      <View className="gap-2">
                        <Text className="text-sm font-medium text-black">Password</Text>
                        <Field
                          placeholder="Password"
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                      <View className="mt-1 flex-row items-center gap-2">
                        <Button
                          variant="outline"
                          style={[WHITE_BUTTON, loading && { opacity: 0.5 }]}
                          disabled={loading}
                          onPress={() => {
                            if (reauthActive) cancelReauth();
                            goToPage(1);
                          }}>
                          <Text className="text-black">Back</Text>
                        </Button>
                        <Button
                          className="flex-1 flex-row gap-2"
                          disabled={!canSubmit}
                          onPress={handleLogin}>
                          {loading && <Spinner size="small" color={spinnerColor} />}
                          <Text>Login</Text>
                        </Button>
                      </View>
                    </View>
                  </View>
                </Animated.View>
              </Animated.View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
