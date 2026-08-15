import { MfaPrompt, type MfaIcon } from '@/components/custom/mfa-prompt';
import { MicrosoftWebView } from '@/components/custom/microsoft-webview';
import { Spinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  CLASSLINK_LAUNCHPAD_BASE,
  classlinkCodeFromLink,
  parseLoginMethods,
  PLATFORM_MAPPING,
  PLATFORMS,
  type District,
  type LoginTitles,
} from '@/lib/constants';
import { fetchAuthMethods, fetchDistrictDetails, login } from '@/lib/grades-api';
import { useStore } from '@/lib/store';
import { usePrimaryForegroundColor } from '@/lib/use-primary-foreground-color';
import { cn } from '@/lib/utils';
import { BlurView } from 'expo-blur';
import * as NavigationBar from 'expo-navigation-bar';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { KeyRound } from 'lucide-react-native';
import * as React from 'react';
import {
  FlatList,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
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

// --- Step transition tuning --------------------------------------------------
// Steps slide like a filmstrip: the outgoing step and the incoming step are both
// fully opaque and sit exactly one viewport-width apart, then move together as a
// single unit. No fade — you should see the next page arrive, not dissolve in.
//
// The wizard branches rather than running in a straight line, so there is no
// fixed strip to scroll along. Instead only two panes are ever mounted and the
// incoming one is *placed* a full width away on the side we're travelling from
// (right when going forward, left when going back), which gives the same
// in-line feel for any pair of steps.
//
// Decisive start with a long soft settle — the travel is now a whole page width,
// so it needs a touch longer than the web's 320ms nudge to stay readable.
const STEP_EASING = Easing.bezier(0.32, 0.72, 0, 1);
const STEP_DURATION = 380;
const STEP_TIMING = { duration: STEP_DURATION, easing: STEP_EASING } as const;

const PRESS_TIMING = { duration: 120, easing: Easing.out(Easing.quad) } as const;

/** Where a pane sits along the strip. The incoming page closes a full-width gap
 *  on the side we're travelling from; the outgoing page opens the same gap on
 *  the opposite side, so the pair never overlaps and never leaves a seam. */
function paneOffset(incoming: boolean, progress: number, dir: number, width: number) {
  'worklet';
  return incoming ? (1 - progress) * dir * width : -progress * dir * width;
}

const paneStyles = StyleSheet.create({
  // The current page is in normal flow, so it alone drives the measured height.
  current: { width: '100%' },
  // The page sliding away shares the current page's origin (they're separated
  // purely by their transforms) and is taken out of flow so it can't affect
  // the height the container is animating toward.
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
});

type LoginType = 'credentials' | 'classlink' | 'classlinkCredentials';
type Step = 'entry' | 'district-list' | 'custom-platform' | 'custom-source' | 'form' | 'student-picker';

// The login card is always light (over the wallpaper); the shared Button's
// `outline` variant uses theme tokens that go dark, so pin an opaque white
// surface via inline style instead.
const WHITE_BUTTON = {
  backgroundColor: '#ffffff',
  borderColor: 'rgba(0,0,0,0.12)',
};

const PLATFORM_LOGOS: Record<string, ReturnType<typeof require>> = {
  hac: require('@/assets/images/hac.png'),
  'skyward-legacy': require('@/assets/images/skyward.png'),
  powerschool: require('@/assets/images/powerschool.png'),
};
const CLASSLINK_LOGO = require('@/assets/images/classlink.png');
const MICROSOFT_LOGO = require('@/assets/images/microsoft.png');

function Logo() {
  return (
    <View className="flex-row items-center gap-4">
      <View className="aspect-square items-center justify-center rounded-xl bg-[#9cd0fb] p-1">
        <Svg width={56} height={56} viewBox="0 -960 960 960" fill="#103074">
          <Path d={LOGO_PATH} />
        </Svg>
      </View>
      <Text className="text-4xl font-extrabold tracking-tight text-black">Gradiate</Text>
    </View>
  );
}

function MicrosoftLogo() {
  return <Image source={MICROSOFT_LOGO} style={{ width: 18, height: 18 }} resizeMode="contain" />;
}

/** A lightweight text field styled to mirror the web's shadcn Input. */
function Field({ className, ...props }: React.ComponentProps<typeof TextInput>) {
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

function DistrictRow({ district, onPress }: { district: District; onPress?: () => void }) {
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

/** A square, selectable card used by the Custom flow's platform/source grids.
 *  Takes either a lucide `icon` or an image `logo` — never both.
 *
 *  Sizing note: the card fills its parent's width and derives its height from
 *  `aspectRatio`. It deliberately does NOT use `flex-1` — the platform grid
 *  puts each card inside a fixed-width (column) wrapper, where `flex-1` would
 *  resolve against the *vertical* axis and collapse the tile to zero height. */
function ChoiceCard({
  icon,
  logo,
  label,
  onPress,
}: {
  icon?: typeof KeyRound;
  logo?: ReturnType<typeof require>;
  label: string;
  onPress: () => void;
}) {
  const pressed = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.05 }],
  }));

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          pressed.value = withTiming(1, PRESS_TIMING);
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, PRESS_TIMING);
        }}
        style={{ width: '100%', aspectRatio: 1 }}
        className="items-center justify-center gap-2 rounded-xl border border-black/15 bg-white/60 p-3 active:bg-white/90">
        {logo ? (
          <Image source={logo} style={{ width: 40, height: 40 }} resizeMode="contain" />
        ) : (
          icon && <Icon as={icon} className="text-black" size={30} />
        )}
        <Text className="text-center text-sm font-medium text-black" numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** The wallpaper + blur. Memoised because the login screen re-renders on every
 *  keystroke (search / username / password) and re-rendering a full-screen
 *  BlurView on each one is what makes the animations stutter. */
const Backdrop = React.memo(function Backdrop() {
  return (
    <ImageBackground source={WALLPAPER} resizeMode="cover" style={StyleSheet.absoluteFill}>
      <BlurView intensity={40} tint="light" style={{ flex: 1 }} />
    </ImageBackground>
  );
});

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const spinnerColor = usePrimaryForegroundColor();

  const reauthUsername = useStore((s) => s.reauthUsername);
  const reauthDistrict = useStore((s) => s.reauthDistrict);
  const setReauthRequired = useStore((s) => s.setReauthRequired);
  const changeUserData = useStore((s) => s.changeUserData);
  const [reauthActive, setReauthActive] = React.useState(() => !!reauthUsername);

  // --- Wizard navigation -----------------------------------------------------
  const [step, setStep] = React.useState<Step>(reauthActive ? 'form' : 'entry');
  const historyRef = React.useRef<Step[]>([]);

  // The step sliding away. It stays mounted (and non-interactive) until the
  // slide finishes, so both pages are on screen for the whole travel.
  const [prevStep, setPrevStep] = React.useState<Step | null>(null);
  const navId = React.useRef(0);

  // There are exactly two panes, and which one holds the current step alternates
  // with every navigation. That alternation is the point: it keeps each pane at
  // a fixed position in the tree, so the page sliding out keeps the component
  // instances it already had. Re-parenting it instead would remount its content
  // — the district FlatList would snap back to the top mid-slide, in full view,
  // and pay for a fresh mount exactly as the animation starts.
  const [active, setActive] = React.useState<0 | 1>(0);
  const activeSV = useSharedValue<0 | 1>(0);

  // 0 = the incoming page is a full width away, 1 = it has arrived. Driven by
  // hand rather than by Reanimated's `entering`/`exiting`, whose builders are
  // rebuilt on every render and re-fire the animation when unrelated state
  // changes (the districts fetch resolving, a keystroke).
  const progress = useSharedValue(1);
  const dirSV = useSharedValue<1 | -1>(1);
  // Travel distance = the viewport's own width, so the two pages sit edge to
  // edge with no gap and no overlap.
  const viewportW = useSharedValue(0);

  // Plain functions, not `useCallback`s: nothing downstream is memoised on their
  // identity, and the compiler forbids mutating a shared value that an earlier
  // hook already captured — so every shared-value write has to sit above the
  // `useAnimatedStyle` calls that read it.
  const onViewportLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    viewportW.value = e.nativeEvent.layout.width;
  };

  const endNav = (id: number) => {
    if (id === navId.current) setPrevStep(null);
  };

  const navigate = (next: Step, direction: 1 | -1) => {
    if (next === step) return;
    const nextActive: 0 | 1 = active === 0 ? 1 : 0;
    navId.current += 1;
    dirSV.value = direction;
    activeSV.value = nextActive;
    // Park the incoming page off screen *before* React commits it, so it never
    // paints a frame in its final position — that frame is what reads as a snap.
    progress.value = 0;
    setPrevStep(step);
    setActive(nextActive);
    setStep(next);
  };

  const go = (next: Step) => {
    historyRef.current.push(step);
    navigate(next, 1);
  };
  const back = () => navigate(historyRef.current.pop() ?? 'entry', -1);

  // Start the slide only once the new page has actually been committed, so the
  // travel always begins from a correctly-positioned first frame. Skipped on the
  // initial mount, which has nothing to slide in from.
  const mountedRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const id = navId.current;
    progress.value = withTiming(1, STEP_TIMING, (finished) => {
      if (finished) runOnJS(endNav)(id);
    });
  }, [step, progress]);

  // Both panes share one progress value, so they move as a single strip: the
  // incoming page closes its full-width gap while the outgoing page opens the
  // same gap on the other side. Opacity is deliberately untouched — this is a
  // translate, not a crossfade.
  const pane0Style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: paneOffset(
          activeSV.value === 0,
          progress.value,
          dirSV.value,
          viewportW.value
        ),
      },
    ],
  }));
  const pane1Style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: paneOffset(
          activeSV.value === 1,
          progress.value,
          dirSV.value,
          viewportW.value
        ),
      },
    ],
  }));

  const slot0 = active === 0 ? step : prevStep;
  const slot1 = active === 1 ? step : prevStep;

  // --- Selection / form state ------------------------------------------------
  const [platform, setPlatform] = React.useState<(typeof PLATFORMS)[number]>(
    (reauthDistrict?.platform as (typeof PLATFORMS)[number]) || 'hac'
  );
  const [loginType, setLoginType] = React.useState<LoginType>(
    (reauthDistrict?.loginType as LoginType) || 'credentials'
  );
  const [fromCustom, setFromCustom] = React.useState(false);
  const [districtName, setDistrictName] = React.useState(reauthDistrict?.name || '');
  const [link, setLink] = React.useState(reauthDistrict?.link || '');
  const [code, setCode] = React.useState(reauthDistrict?.code || '');

  const [username, setUsername] = React.useState(reauthUsername ?? '');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    reauthActive ? 'Your password or 2FA has changed. Please log in again.' : null
  );

  // Custom HAC "fetch details" state.
  const [detailsFetched, setDetailsFetched] = React.useState(false);
  const [fetching, setFetching] = React.useState(false);
  const [districtOptions, setDistrictOptions] = React.useState<{ name: string; value: string }[]>(
    []
  );

  // District list.
  const [search, setSearch] = React.useState('');
  const [districts, setDistricts] = React.useState<District[]>([]);
  const [loadingDistricts, setLoadingDistricts] = React.useState(true);

  // 2FA prompt.
  // Multi-student accounts (e.g. a PowerSchool parent): after a login that
  // returns more than one student, we pause on a picker step before entering.
  const [students, setStudents] = React.useState<{ id: string; name: string }[]>([]);
  const [pendingLogin, setPendingLogin] = React.useState<any>(null);
  // Extra fields to persist when the pending login came from Microsoft SSO, so
  // the student-picker commits it with the right login type + cookies.
  const [pendingOpts, setPendingOpts] = React.useState<{ loginTypeOverride?: LoginType; psCookies?: string } | null>(null);

  // Which sign-in methods the selected district's portal offers. Defaults to
  // credentials-only; refreshed from /authMethods when a district is chosen.
  // Seed the offered methods from the account being re-authenticated so a
  // ClassLink or Microsoft re-auth shows the right form immediately (a fresh
  // start has no reauthDistrict → credentials-only default).
  const [authInfo, setAuthInfo] = React.useState<{ credentials: boolean; microsoft: boolean; classlink: boolean; ssoUrl: string | null }>(
    () => {
      const lt = reauthDistrict?.loginType;
      return {
        credentials: lt !== 'classlinkCredentials' && lt !== 'microsoftSession',
        microsoft: lt === 'microsoftSession',
        classlink: lt === 'classlinkCredentials',
        ssoUrl: null,
      };
    }
  );
  // Optional per-method section titles a district declares (PowerSchool
  // parent-vs-student, e.g. credentials = "Parent Login", microsoft = "Student
  // Login").
  const [loginTitles, setLoginTitles] = React.useState<LoginTitles>({});
  const [msOpen, setMsOpen] = React.useState(false);
  const [msSilent, setMsSilent] = React.useState(false);

  const [mfaOpen, setMfaOpen] = React.useState(false);
  const [mfaType, setMfaType] = React.useState<'pin' | 'image'>('pin');
  const [mfaIcons, setMfaIcons] = React.useState<MfaIcon[]>([]);
  const [mfaLoading, setMfaLoading] = React.useState(false);
  const [mfaError, setMfaError] = React.useState<string | null>(null);

  const cancelReauth = React.useCallback(() => {
    setReauthActive(false);
    setReauthRequired(null);
    setUsername('');
  }, [setReauthRequired]);

  React.useEffect(() => {
    (async () => {
      try {
        setLoadingDistricts(true);
        const response = await fetch('https://web.gradiate.app/districts.json');
        if (!response.ok) throw new Error('Failed to fetch districts');
        setDistricts(await response.json());
      } catch (e) {
        console.error('Error fetching districts:', e);
      } finally {
        setLoadingDistricts(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setStyle('dark');
  }, []);

  // --- Animated card height (adapts to the active step) ----------------------
  // A single writer (`retarget`) owns `cardHeight`. The previous code had both
  // the layout callback and a step effect writing it, and compared measured
  // heights with `===` — sub-pixel differences between layout passes then
  // restarted the timing animation over and over, which read as jitter.
  const cardHeight = useSharedValue(0);
  const heights = React.useRef<Record<string, number>>({});
  const targetHeight = React.useRef(0);

  const retarget = React.useCallback(
    (h: number) => {
      if (!h || Math.abs(targetHeight.current - h) < 0.5) return;
      targetHeight.current = h;
      // First measurement has nothing to animate from — snap.
      if (cardHeight.value === 0) cardHeight.value = h;
      else cardHeight.value = withTiming(h, STEP_TIMING);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Measured off each pane's own content, which the animated container never
  // constrains, so this is always the true content height. Web gets the same
  // signal from a ResizeObserver on the step node. Only the *current* step may
  // move the container — the page sliding away reports its height too, and
  // acting on it would drag the height back to where it came from.
  const onMeasure = (s: Step, h: number) => {
    if (!h) return;
    heights.current[s] = h;
    if (s === step) retarget(h);
  };

  // Start moving toward a known height on the same frame the new step mounts, so
  // the container doesn't clip it while waiting for its layout pass.
  // `retarget`'s guard makes the subsequent onLayout a no-op.
  React.useEffect(() => {
    const h = heights.current[step];
    if (h) retarget(h);
  }, [step, retarget]);

  const heightStyle = useAnimatedStyle(() =>
    cardHeight.value > 0 ? { height: cardHeight.value } : {}
  );

  // --- District selection from the list --------------------------------------
  const selectDistrict = (d: District) => {
    const plat = (d.platform as (typeof PLATFORMS)[number]) || 'hac';
    setPlatform(plat);
    // The list already declares the offered methods in the slash `loginType`, so
    // derive the sign-in buttons straight from it — no `/authMethods` probe. Base
    // the credential flow on credentials when offered, else ClassLink.
    const methods = parseLoginMethods(d.loginType);
    const lt: LoginType = methods.credentials
      ? 'credentials'
      : methods.classlink
        ? 'classlinkCredentials'
        : 'credentials';
    setLoginType(lt);
    setDistrictName(d.name);
    setLink(d.link);
    // Prefill the ClassLink code from the loginType's inline "classlink:<code>"
    // when declared, else derive it from the launchpad link.
    setCode(methods.classlink ? methods.classlinkCode || classlinkCodeFromLink(d.link) : '');
    setFromCustom(false);
    setDetailsFetched(true); // list districts are already resolved
    setDistrictOptions([]);
    setUsername('');
    setPassword('');
    setError(null);
    setAuthInfo({
      credentials: methods.credentials,
      microsoft: methods.microsoft,
      classlink: methods.classlink,
      ssoUrl: null,
    });
    setLoginTitles(d.loginTitles ?? {});
    go('form');
    // Clear the query only once the list has slid off screen — it stays mounted
    // as the outgoing page for the whole travel.
    setTimeout(() => setSearch(''), STEP_DURATION);
  };

  // Switch the active credential form between the offered methods (fixing the
  // old one-way behaviour where the switch button vanished with no way back).
  // Microsoft isn't a credential form mode — it's its own action button — so only
  // credentials ↔ ClassLink swap here.
  const switchMethod = (method: 'credentials' | 'classlink') => {
    setError(null);
    if (method === 'classlink') {
      setLoginType('classlinkCredentials');
      setCode((c) => c || classlinkCodeFromLink(link) || '');
    } else {
      setLoginType('credentials');
    }
  };

  const pickPlatform = (p: (typeof PLATFORMS)[number]) => {
    setPlatform(p);
    go('custom-source');
  };

  const pickSource = (source: 'credentials' | 'classlink') => {
    const lt: LoginType = source === 'classlink' ? 'classlinkCredentials' : 'credentials';
    setLoginType(lt);
    setFromCustom(true);
    setDistrictName('');
    setLink('');
    setCode('');
    setUsername('');
    setPassword('');
    setDetailsFetched(false);
    setDistrictOptions([]);
    setError(null);
    setAuthInfo({
      credentials: source === 'credentials',
      microsoft: false,
      classlink: source === 'classlink',
      ssoUrl: null,
    });
    setLoginTitles({});
    go('form');
  };

  const doFetchDetails = async () => {
    if (!link.trim()) return;
    setFetching(true);
    setError(null);
    // A Custom link is undeclared, so this is exactly where we DO probe: discover
    // both the multi-district picker (HAC) and the offered sign-in methods
    // (credentials / Microsoft, e.g. for a PowerSchool portal) in parallel.
    const [res, methods] = await Promise.all([
      fetchDistrictDetails(platform, link.trim()),
      fetchAuthMethods(platform, link.trim()),
    ]);
    setDistrictOptions(res.districts);
    if (res.multiple && res.districts[0]) setDistrictName(res.districts[0].name);
    setAuthInfo({
      credentials: methods.credentials,
      microsoft: methods.microsoft,
      classlink: false,
      ssoUrl: methods.ssoUrl,
    });
    setLoginTitles({});
    // A Microsoft-only portal has no credentials form — keep the active mode off
    // ClassLink so the Microsoft (student) button is what shows.
    if (!methods.credentials && methods.microsoft) setLoginType('credentials');
    setDetailsFetched(true);
    setFetching(false);
  };

  const finalizeLogin = (
    data: any,
    answeredMfa: string,
    chosen?: { id: string; name: string } | null,
    opts?: { loginTypeOverride?: LoginType; psCookies?: string }
  ) => {
    const effectiveLoginType = opts?.loginTypeOverride || loginType;
    const resolvedCode =
      effectiveLoginType === 'classlinkCredentials' ? code || classlinkCodeFromLink(link) : '';
    const studentId = chosen?.id || data.studentId || '';
    const displayName = chosen?.name || data.name || '';

    if (reauthActive) {
      changeUserData('password', password);
      changeUserData('clMFA', answeredMfa);
      changeUserData('mfaType', answeredMfa ? mfaType : '');
      changeUserData('code', resolvedCode);
      if (opts?.loginTypeOverride) changeUserData('loginType', opts.loginTypeOverride);
      if (opts?.psCookies) changeUserData('psCookies', opts.psCookies);
      if (studentId) changeUserData('studentId', studentId);
      if (data.username) changeUserData('username', data.username);
      if (data.link) changeUserData('link', data.link);
      setReauthRequired(null);
      setReauthActive(false);
    } else {
      const newIndex = useStore.getState().users.length;
      useStore.getState().addUser({
        loginType: effectiveLoginType,
        username: data.username || username,
        password,
        platform,
        link: data.link || link,
        code: resolvedCode,
        clMFA: answeredMfa,
        mfaType: answeredMfa ? mfaType : '',
        psCookies: opts?.psCookies || '',
        school: data.school || '',
        district: data.district || districtName,
        name: displayName,
        avatar: DEFAULT_AVATAR,
        premium: data.numReferrals >= 0,
        studentId,
        students: data.students || [],
      });
      useStore.getState().setCurrentUserIndex(newIndex);
    }
    setMfaOpen(false);
    router.replace('/grades');
  };

  // Called by the Microsoft WebView once it has captured the portal session
  // cookies. Trades them for a `microsoftSession` login and enters the app (or the
  // student picker for a multi-student account).
  const doMicrosoftLogin = async (cookies: string) => {
    setMsOpen(false);
    setMsSilent(false);
    setLoading(true);
    setError(null);
    try {
      const data = await login(platform, 'microsoftSession', { link, cookies }, '');
      if (!data?.success) {
        setError('Microsoft sign-in failed');
        return;
      }
      const opts = { loginTypeOverride: 'microsoftSession' as LoginType, psCookies: cookies };
      if (!reauthActive && Array.isArray(data.students) && data.students.length > 1) {
        setPendingLogin(data);
        setStudents(data.students);
        setPendingOpts(opts);
        go('student-picker');
        return;
      }
      finalizeLogin(data, '', null, opts);
    } catch (e: any) {
      setError(e?.message ?? 'Microsoft sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const ssoUrl = authInfo.ssoUrl || (link ? `${link.replace(/\/?$/, '/')}guardian/home.html?_userTypeHint=student` : '');

  // Re-auth for a Microsoft account: the stored portal cookies expired. Reopen the
  // WebView in "silent" mode — because Microsoft's own "stay signed in" cookie
  // persists in the WebView, this usually completes without the user typing
  // anything, refreshing the portal cookies. (This is what makes it "sign in once".)
  const msReauthTriggered = React.useRef(false);
  React.useEffect(() => {
    if (reauthActive && reauthDistrict?.loginType === 'microsoftSession' && !msReauthTriggered.current) {
      msReauthTriggered.current = true;
      setAuthInfo({ credentials: false, microsoft: true, classlink: false, ssoUrl: null });
      setMsSilent(true);
      setMsOpen(true);
    }
  }, [reauthActive, reauthDistrict]);

  // Runs the login. `answeredMfa` is set when resuming a 2FA challenge.
  const doLogin = async (answeredMfa = '') => {
    setError(null);
    if (answeredMfa) {
      setMfaLoading(true);
      setMfaError(null);
    } else {
      setLoading(true);
    }

    try {
      const details: Record<string, string> = { username, password };
      if (loginType === 'classlinkCredentials') {
        details.code = code || classlinkCodeFromLink(link);
        details.link = '';
        if (answeredMfa) details.clMFA = answeredMfa;
      } else {
        details.link = link;
        details.clsession = '';
        if (districtName) details.district = districtName;
      }

      const data = await login(platform, loginType, details, '');

      if (data?.mfaRequired) {
        setMfaType(data.mfaType === 'image' ? 'image' : 'pin');
        setMfaIcons(data.icons || []);
        setMfaOpen(true);
        return;
      }

      if (data?.success) {
        // Multi-student parent account: pause and let them choose who to view
        // (fresh logins only — a re-auth keeps the already-chosen student).
        if (!reauthActive && Array.isArray(data.students) && data.students.length > 1) {
          setPendingLogin(data);
          setStudents(data.students);
          setMfaOpen(false);
          go('student-picker');
          return;
        }
        finalizeLogin(data, answeredMfa);
      } else {
        setError('Login failed');
      }
    } catch (e: any) {
      if (answeredMfa) setMfaError(e.message ?? 'Verification failed');
      else setError(e.message ?? 'Login failed');
    } finally {
      setLoading(false);
      setMfaLoading(false);
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

  const isClassLink = loginType === 'classlinkCredentials';
  // For custom HAC credentials we gate the username/password behind the
  // "fetch details" step; every other path shows credentials immediately.
  const needsFetch = fromCustom && loginType === 'credentials';
  const showCredentials = !needsFetch || detailsFetched;
  // The active credential mode actually has a username/password form. Both plain
  // credentials and ClassLink use one; a Microsoft-only portal has neither.
  const hasCredForm = isClassLink ? authInfo.classlink : authInfo.credentials;
  const showCredForm = showCredentials && hasCredForm;
  // Section titles. PowerSchool distinguishes a parent credentials login from a
  // student Microsoft login; a district can name them via `loginTitles`, and we
  // fall back to "Parent Login"/"Student Login" for any PowerSchool portal that
  // offers both (so the Custom flow gets the distinction too).
  const psParentStudent = platform === 'powerschool' && authInfo.microsoft;
  const credTitle =
    loginTitles.credentials || (psParentStudent && authInfo.credentials ? 'Parent Login' : undefined);
  const classlinkTitle = loginTitles.classlink;
  const microsoftTitle = loginTitles.microsoft || (platform === 'powerschool' ? 'Student Login' : undefined);
  const activeTitle = isClassLink ? classlinkTitle : credTitle;
  const canSubmit =
    !loading && username.length > 0 && password.length > 0 && (isClassLink ? !!code || !!link : true);

  // --- Step renderers --------------------------------------------------------
  const renderEntry = () => (
    <View className="gap-2">
      <Button
        variant="outline"
        className="w-full"
        style={WHITE_BUTTON}
        disabled={loadingDistricts}
        onPress={() => go('district-list')}>
        <Text className={cn('text-black', loadingDistricts && 'text-black/40')}>
          {loadingDistricts ? 'Loading Districts...' : 'Select District'}
        </Text>
      </Button>
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" style={[WHITE_BUTTON, { opacity: 1 }]} disabled>
          <Text className="text-black/40">Demo</Text>
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          style={WHITE_BUTTON}
          onPress={() => go('custom-platform')}>
          <Text className="text-black">Custom</Text>
        </Button>
      </View>
    </View>
  );

  const renderDistrictList = () => (
    <View className="gap-3">
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
            <Text className="text-center text-sm text-black/60">Loading districts...</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(d) => d.link + d.name}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            // The full district list is long; rendering it all on mount blocks
            // the JS thread right as the step transition starts.
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            ItemSeparatorComponent={() => <View className="h-2" />}
            renderItem={({ item }) => (
              <DistrictRow district={item} onPress={() => selectDistrict(item)} />
            )}
            ListEmptyComponent={
              <Text className="py-2 text-center text-black/50">No districts found.</Text>
            }
          />
        )}
      </View>
      <Button variant="outline" className="w-full" style={WHITE_BUTTON} onPress={back}>
        <Text className="text-black">Back</Text>
      </Button>
    </View>
  );

  const renderStudentPicker = () => (
    <View className="gap-3">
      <Text className="text-center text-base font-semibold text-black">Choose a student</Text>
      <Text className="text-center text-sm text-black/60">
        This account has more than one student. Pick who to view.
      </Text>
      {error ? <Text className="text-center text-sm text-red-600">{error}</Text> : null}
      <View className="gap-2">
        {students.map((s) => (
          <Button
            key={s.id}
            variant="outline"
            className="w-full"
            style={WHITE_BUTTON}
            disabled={loading}
            onPress={() => {
              setLoading(true);
              try {
                finalizeLogin(pendingLogin, '', s, pendingOpts ?? undefined);
              } catch (e: any) {
                setError(e?.message ?? 'Could not select student');
                setLoading(false);
              }
            }}>
            <Text className="text-black">{s.name}</Text>
          </Button>
        ))}
      </View>
      <Button variant="outline" className="w-full" style={WHITE_BUTTON} onPress={back} disabled={loading}>
        <Text className="text-black">Back</Text>
      </Button>
    </View>
  );

  const renderCustomPlatform = () => (
    <View className="gap-3">
      <Text className="text-center text-sm font-medium text-black">Choose your platform</Text>
      {/* Two per row (not three) so the tiles stay comfortably large; a trailing
          odd tile keeps its half-width rather than stretching full-width. */}
      <View className="flex-row flex-wrap gap-3">
        {PLATFORMS.map((p) => (
          <View key={p} style={{ width: '47%' }}>
            <ChoiceCard
              logo={PLATFORM_LOGOS[p]}
              label={PLATFORM_MAPPING[p] ?? p}
              onPress={() => pickPlatform(p)}
            />
          </View>
        ))}
      </View>
      <Button variant="outline" className="w-full" style={WHITE_BUTTON} onPress={back}>
        <Text className="text-black">Back</Text>
      </Button>
    </View>
  );

  const renderCustomSource = () => (
    <View className="gap-3">
      <Text className="text-center text-sm font-medium text-black">Choose your login source</Text>
      {/* ChoiceCard fills its parent's width, so the row splits the width here. */}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ChoiceCard icon={KeyRound} label="Credentials" onPress={() => pickSource('credentials')} />
        </View>
        <View className="flex-1">
          <ChoiceCard
            logo={CLASSLINK_LOGO}
            label="ClassLink"
            onPress={() => pickSource('classlink')}
          />
        </View>
      </View>
      <Button variant="outline" className="w-full" style={WHITE_BUTTON} onPress={back}>
        <Text className="text-black">Back</Text>
      </Button>
    </View>
  );

  const renderForm = () => (
    <View className="gap-4">
      {!fromCustom && districtName ? (
        <DistrictRow
          district={{
            name: districtName,
            platform,
            // A district picked from the list already has its ClassLink code
            // resolved, so show the launchpad URL it'll actually sign in
            // through instead of the portal link.
            link: isClassLink ? `${CLASSLINK_LAUNCHPAD_BASE}${code}` : link,
            loginType,
          }}
        />
      ) : (
        <View className="rounded-lg border border-black/15 bg-white/50 p-3">
          <Text className="text-base font-semibold text-black">
            {PLATFORM_MAPPING[platform] ?? platform}
          </Text>
          <Text className="text-xs text-black/50">
            {isClassLink ? 'ClassLink login' : 'Credentials login'}
          </Text>
        </View>
      )}

      {error && <Text className="text-center text-sm text-red-600">{error}</Text>}

      {/* ClassLink: launchpad link with a fixed prefix; user types only the
          code. Only shown for a Custom ClassLink login — a district picked
          from the list already has its code resolved and shows it in the
          item above instead. */}
      {isClassLink && fromCustom && (
        <View className="gap-2">
          <Text className="text-sm font-medium text-black">District Link</Text>
          <View className="w-full flex-row items-center rounded-md border border-black/15 bg-white/70 px-3">
            <Text className="text-base text-black/50">{CLASSLINK_LAUNCHPAD_BASE}</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="katyisd"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 text-base text-black"
              style={{ height: 44 }}
            />
          </View>
        </View>
      )}

      {/* Custom HAC credentials: link entry + fetch-details gate. */}
      {needsFetch && (
        <View className="gap-2">
          <Text className="text-sm font-medium text-black">District Link</Text>
          <Field
            placeholder="homeaccess.example.org"
            value={link}
            onChangeText={(t) => {
              setLink(t);
              setDetailsFetched(false);
              setDistrictOptions([]);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!detailsFetched && (
            <Button
              className="w-full flex-row gap-2"
              disabled={fetching || !link.trim()}
              onPress={doFetchDetails}>
              {fetching && <Spinner size="small" color={spinnerColor} />}
              <Text>Fetch details</Text>
            </Button>
          )}
        </View>
      )}

      {/* District picker — only when the fetched HAC link fronts several. */}
      {showCredentials && districtOptions.length > 1 && (
        <View className="gap-2">
          <Text className="text-sm font-medium text-black">District</Text>
          <View className="gap-2">
            {districtOptions.map((d) => (
              <Pressable
                key={d.value}
                onPress={() => setDistrictName(d.name)}
                className={cn(
                  'rounded-md border p-2.5',
                  districtName === d.name
                    ? 'border-black/40 bg-white'
                    : 'border-black/15 bg-white/50'
                )}>
                <Text className="text-sm text-black">{d.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {showCredForm && (
        <>
          {activeTitle ? (
            <Text className="text-sm font-semibold text-black">{activeTitle}</Text>
          ) : null}
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
        </>
      )}

      <View className="mt-1 flex-row items-center gap-2">
        <Button
          variant="outline"
          style={[WHITE_BUTTON, loading && { opacity: 0.5 }]}
          disabled={loading}
          onPress={() => {
            if (reauthActive) cancelReauth();
            back();
          }}>
          <Text className="text-black">Back</Text>
        </Button>
        {showCredForm && (
          <Button className="flex-1 flex-row gap-2" disabled={!canSubmit} onPress={() => doLogin()}>
            {loading && <Spinner size="small" color={spinnerColor} />}
            <Text>Login</Text>
          </Button>
        )}
      </View>

      {/* Alternative sign-in methods the district also offers. Each is a switch
          button (fixing the old one-way behaviour where the button vanished with
          no way back to credentials). A separator "or" shows when a credential
          form sits above them. */}
      {showCredentials &&
        (authInfo.microsoft ||
          (authInfo.classlink && !isClassLink) ||
          (authInfo.credentials && isClassLink)) && (
        <>
          {showCredForm && <Text className="text-center text-xs text-black/40">or</Text>}

          {/* Switch into the ClassLink launchpad-code credential flow. */}
          {authInfo.classlink && !isClassLink && (
            <Button
              variant="outline"
              className="w-full flex-row gap-2"
              style={[WHITE_BUTTON, loading && { opacity: 0.5 }]}
              disabled={loading}
              onPress={() => switchMethod('classlink')}>
              <Image source={CLASSLINK_LOGO} style={{ width: 18, height: 18 }} resizeMode="contain" />
              <Text className="text-black">{classlinkTitle || 'Sign in with ClassLink'}</Text>
            </Button>
          )}

          {/* Switch back to the plain credentials form (from ClassLink). */}
          {authInfo.credentials && isClassLink && (
            <Button
              variant="outline"
              className="w-full flex-row gap-2"
              style={[WHITE_BUTTON, loading && { opacity: 0.5 }]}
              disabled={loading}
              onPress={() => switchMethod('credentials')}>
              <Icon as={KeyRound} className="text-black" size={18} />
              <Text className="text-black">{credTitle || 'Sign in with Credentials'}</Text>
            </Button>
          )}

          {/* Microsoft SSO (mobile-only): opens the portal's real Microsoft sign-in
              in a WebView and hands the resulting session cookies to the API. */}
          {authInfo.microsoft && (
            <Button
              variant="outline"
              className="w-full flex-row gap-2"
              style={[WHITE_BUTTON, (loading || !ssoUrl) && { opacity: 0.5 }]}
              disabled={loading || !ssoUrl}
              onPress={() => {
                setError(null);
                setMsSilent(false);
                setMsOpen(true);
              }}>
              <MicrosoftLogo />
              <Text className="text-black">{microsoftTitle || 'Sign in with Microsoft'}</Text>
            </Button>
          )}
        </>
      )}
    </View>
  );

  const renderStep = (s: Step) => {
    switch (s) {
      case 'entry':
        return renderEntry();
      case 'district-list':
        return renderDistrictList();
      case 'custom-platform':
        return renderCustomPlatform();
      case 'custom-source':
        return renderCustomSource();
      case 'form':
        return renderForm();
      case 'student-picker':
        return renderStudentPicker();
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
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

            <View className="mt-6 w-full" onLayout={onViewportLayout}>
              {/* Animated height container, clipping the strip either side.
                  The two panes below are unkeyed and stay mounted for the life
                  of the screen, so the UI thread drives them without
                  interruption and neither ever paints a frame from a stale
                  initial style. Which one is current alternates per navigation;
                  only the plain Views inside are keyed, so a page keeps its
                  component instances while it slides away. */}
              <Animated.View style={[heightStyle, { width: '100%', overflow: 'hidden' }]}>
                <Animated.View
                  pointerEvents={active === 0 ? 'auto' : 'none'}
                  style={[pane0Style, active === 0 ? paneStyles.current : paneStyles.leaving]}>
                  {slot0 && (
                    <View
                      key={slot0}
                      onLayout={(e) => onMeasure(slot0, e.nativeEvent.layout.height)}>
                      {renderStep(slot0)}
                    </View>
                  )}
                </Animated.View>

                <Animated.View
                  pointerEvents={active === 1 ? 'auto' : 'none'}
                  style={[pane1Style, active === 1 ? paneStyles.current : paneStyles.leaving]}>
                  {slot1 && (
                    <View
                      key={slot1}
                      onLayout={(e) => onMeasure(slot1, e.nativeEvent.layout.height)}>
                      {renderStep(slot1)}
                    </View>
                  )}
                </Animated.View>
              </Animated.View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <MfaPrompt
        open={mfaOpen}
        mfaType={mfaType}
        icons={mfaIcons}
        loading={mfaLoading}
        error={mfaError}
        onSubmit={(answer) => doLogin(answer)}
        onCancel={() => {
          setMfaOpen(false);
          setMfaError(null);
        }}
      />

      {msOpen && !!ssoUrl && (
        <MicrosoftWebView
          visible={msOpen}
          ssoUrl={ssoUrl}
          portalLink={link}
          silent={msSilent}
          onCaptured={(cookies) => void doMicrosoftLogin(cookies)}
          onCancel={() => {
            setMsOpen(false);
            setMsSilent(false);
          }}
        />
      )}
    </View>
  );
}
