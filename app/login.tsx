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
  TextInput,
  View,
} from 'react-native';
import Animated, {
  SlideInLeft,
  SlideInRight,
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

const STEP_DURATION = 320;

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
 *  Takes either a lucide `icon` or an image `logo` — never both. */
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
  return (
    <Pressable
      onPress={onPress}
      className="aspect-square flex-1 items-center justify-center gap-2 rounded-xl border border-black/15 bg-white/60 p-3 active:bg-white/90">
      {logo ? (
        <Image source={logo} style={{ width: 40, height: 40 }} resizeMode="contain" />
      ) : (
        icon && <Icon as={icon} className="text-black" size={30} />
      )}
      <Text className="text-center text-sm font-medium text-black" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

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
  const [dir, setDir] = React.useState<1 | -1>(1);
  const historyRef = React.useRef<Step[]>([]);

  const go = React.useCallback(
    (next: Step) => {
      historyRef.current.push(step);
      setDir(1);
      setStep(next);
    },
    [step]
  );
  const back = React.useCallback(() => {
    const prev = historyRef.current.pop();
    setDir(-1);
    setStep(prev ?? 'entry');
  }, []);

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
  const cardHeight = useSharedValue(0);
  const heights = React.useRef<Record<string, number>>({});

  const onMeasure = (s: Step, h: number) => {
    if (!h || heights.current[s] === h) return;
    heights.current[s] = h;
    if (s === step) {
      if (cardHeight.value === 0) cardHeight.value = h;
      else cardHeight.value = withTiming(h, { duration: STEP_DURATION });
    }
  };

  React.useEffect(() => {
    const h = heights.current[step];
    if (h) cardHeight.value = withTiming(h, { duration: STEP_DURATION });
  }, [step, cardHeight]);

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
      <View className="flex-row gap-3">
        <ChoiceCard icon={KeyRound} label="Credentials" onPress={() => pickSource('credentials')} />
        <ChoiceCard logo={CLASSLINK_LOGO} label="ClassLink" onPress={() => pickSource('classlink')} />
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

  const renderStep = () => {
    switch (step) {
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

            <View className="mt-6 w-full overflow-hidden">
              <Animated.View style={heightStyle} className="w-full">
                {/* Only the active step is mounted (keyed), so a jump between
                    non-adjacent steps never renders the ones in between. The
                    entering animation slides the new step in from the side the
                    navigation is heading. */}
                <Animated.View
                  key={step}
                  entering={(dir === 1 ? SlideInRight : SlideInLeft).duration(STEP_DURATION)}
                  onLayout={(e) => onMeasure(step, e.nativeEvent.layout.height)}
                  style={{ width: '100%' }}>
                  {renderStep()}
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
