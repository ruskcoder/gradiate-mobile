// app/settings.tsx
import * as React from 'react';
import { View, ScrollView, Pressable, Alert, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { Separator } from '~/components/ui/separator';
import { Input } from '~/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem, ToggleGroupIcon } from '~/components/ui/toggle-group';
import { ColorThemePicker } from '~/components/custom/color-theme-picker';
import {
  ChevronRight,
  Bell,
  Sun,
  Moon,
  SmartphoneIcon,
  Palette,
  HelpCircle,
  LogOut,
  User,
  LayoutGrid,
  Droplets,
  Type,
  Camera,
  Sparkles,
  Image as ImageIcon,
  BellRing,
  ListPlus,
  Share2,
  Copy,
  ClipboardPaste,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { buildBackup, restoreBackup } from '~/lib/backup';
import { syncMissingTodos } from '~/lib/grade-alerts';
import { useAppSettings, type NumberDisplay } from '~/lib/app-settings';
import { sendTestGradeNotification } from '~/lib/grades-notifications-task';
import { canRenderGradeImage } from '~/lib/grade-notification-image';
import { useColorScheme } from '~/lib/useColorScheme';
import { useCurrentUser, useStore } from '~/lib/store';
import { PLATFORM_MAPPING } from '~/lib/constants';
import { type ThemeMode } from '~/lib/theme-mode-storage';
import { cn } from '~/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}

interface SettingsSectionProps {
  title?: string;
  children: React.ReactNode;
}

// ── Components ─────────────────────────────────────────────────────────────────

function SettingsRow({ icon, label, onPress, right, destructive = false }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress && !right}
      className='flex-row items-center px-4 py-3 active:opacity-70'
    >
      <View className='mr-3 h-8 w-8 items-center justify-center rounded-md bg-muted'>
        {icon}
      </View>

      <Text
        className={cn(
          'flex-1 text-base font-medium',
          destructive && 'text-destructive'
        )}
      >
        {label}
      </Text>

      {right ?? (onPress && (
        <Icon as={ChevronRight} className='size-[18px] text-muted-foreground' />
      ))}
    </Pressable>
  );
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View className='mb-6'>
      {title && (
        <Text className='mb-1 px-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground'>
          {title}
        </Text>
      )}
      <View className='overflow-hidden rounded-xl border border-border bg-card'>
        {React.Children.map(children, (child, i) => (
          <>
            {i > 0 && <Separator />}
            {child}
          </>
        ))}
      </View>
    </View>
  );
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/);
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { setColorScheme } = useColorScheme();
  const {
    tabBarIndicatorEnabled,
    setTabBarIndicatorEnabled,
    gradesView,
    setGradesView,
    hideColors,
    setHideColors,
    showPageTitles,
    setShowPageTitles,
    animationsEnabled,
    setAnimationsEnabled,
    notificationsEnabled,
    setNotificationsEnabled,
    gradeImageNotifications,
    setGradeImageNotifications,
    numberDisplay,
    setNumberDisplay,
  } = useAppSettings();

  const [sendingTest, setSendingTest] = React.useState(false);

  /** The image is drawn by a native module, so a build made before it shipped
   *  (or any non-Android device) silently falls back to a text notification.
   *  Say so when the switch is turned on rather than letting it look broken. */
  function toggleGradeImage(value: boolean) {
    setGradeImageNotifications(value);
    if (value && !canRenderGradeImage()) {
      Alert.alert(
        'Not available on this build',
        'Grade images need the Android build that includes them. Notifications will stay text-only until then.'
      );
    }
  }

  async function sendTestNotification() {
    if (sendingTest) return;
    setSendingTest(true);
    try {
      await sendTestGradeNotification(gradeImageNotifications);
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : String(e));
    } finally {
      setSendingTest(false);
    }
  }

  const user = useCurrentUser();
  const removeUser = useStore((s) => s.removeUser);
  const changeUserData = useStore((s) => s.changeUserData);
  const currentUserIndex = useStore((s) => s.currentUserIndex);

  const changeAlerts = user?.changeAlerts !== false;
  const autoTodoFromMissing = !!user?.autoTodoFromMissing;

  function toggleAutoTodo(value: boolean) {
    changeUserData('autoTodoFromMissing', value);
    if (value) syncMissingTodos();
  }

  async function exportBackup() {
    if (!user) return;
    try {
      await Share.share({ title: 'Gradiate backup', message: buildBackup(user) });
    } catch (e) {
      Alert.alert('Could not export', e instanceof Error ? e.message : String(e));
    }
  }

  async function copyBackup() {
    if (!user) return;
    await Clipboard.setStringAsync(buildBackup(user));
    Alert.alert('Backup copied', 'Paste it somewhere safe, like a note or an email to yourself. Passwords are not included.');
  }

  async function restoreFromClipboard() {
    const text = await Clipboard.getStringAsync();
    if (!text) {
      Alert.alert('Clipboard is empty', 'Copy a backup first, then try again.');
      return;
    }
    Alert.alert(
      'Restore backup?',
      'Settings, to-dos, goals, notes and bell schedules will be replaced. Grade history is merged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => {
            try {
              Alert.alert('Backup restored', restoreBackup(text));
            } catch (e) {
              Alert.alert('Could not restore', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]
    );
  }

  const GRADES_VIEW_OPTIONS: { value: 'list' | 'card'; label: string }[] = [
    { value: 'list', label: 'List' },
    { value: 'card', label: 'Cards' },
  ];

  const NUMBER_DISPLAY_OPTIONS: { value: NumberDisplay; label: string; desc: string }[] = [
    { value: 'decimal', label: 'Decimal', desc: '96.6' },
    { value: 'rounded', label: 'Rounded', desc: '97' },
    { value: 'letter', label: 'Letter', desc: 'A' },
    { value: 'letter+', label: 'Letter+', desc: 'A+' },
  ];

  const [editOpen, setEditOpen] = React.useState(false);
  const [editName, setEditName] = React.useState('');
  const [editAvatar, setEditAvatar] = React.useState('');

  function openEditProfile() {
    setEditName(user?.name ?? '');
    setEditAvatar(user?.avatar ?? '');
    setEditOpen(true);
  }

  async function pickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo library access to choose a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setEditAvatar(result.assets[0].uri);
    }
  }

  function saveProfile() {
    changeUserData('name', editName.trim());
    changeUserData('avatar', editAvatar);
    setEditOpen(false);
  }
  // Theme mode lives on the user (like web's `changeUserData('theme', …)`);
  // the root layout re-applies it whenever it changes, but we also flip it
  // immediately here for instant feedback.
  const themeMode: ThemeMode = user?.theme ?? 'light';

  function handleThemeModeChange(mode: ThemeMode) {
    changeUserData('theme', mode);
    setColorScheme(mode);
  }

  const displayName = user?.name || user?.username || 'Guest';
  const subtitle = user
    ? user.district || PLATFORM_MAPPING[user.platform] || user.username
    : 'Not signed in';

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      className='flex-1 bg-background'
    >
      {/* Profile card */}
      <View className='mb-6 items-center bg-card px-4 py-6'>
        <Avatar alt='User avatar' className='mb-3 h-20 w-20'>
          {user?.avatar ? (
            <AvatarImage
              source={typeof user.avatar === 'string' ? { uri: user.avatar } : user.avatar}
            />
          ) : null}
          <AvatarFallback>
            <Text className='text-2xl font-semibold'>{getInitials(displayName)}</Text>
          </AvatarFallback>
        </Avatar>
        <Text className='text-xl font-bold'>{displayName}</Text>
        <Text className='text-sm text-muted-foreground'>{subtitle}</Text>
        <AlertDialog open={editOpen} onOpenChange={setEditOpen}>
          <AlertDialogTrigger asChild>
            <Button variant='outline' size='sm' className='mt-3' onPress={openEditProfile}>
              <Text>Edit Profile</Text>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit Profile</AlertDialogTitle>
              <AlertDialogDescription>
                Update your name and profile picture.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <View className='items-center gap-3'>
              <Pressable onPress={pickAvatar} className='active:opacity-70'>
                <Avatar alt='Selected avatar' className='h-20 w-20'>
                  {editAvatar ? (
                    <AvatarImage
                      source={typeof editAvatar === 'string' ? { uri: editAvatar } : editAvatar}
                    />
                  ) : null}
                  <AvatarFallback>
                    <Text className='text-2xl font-semibold'>
                      {getInitials(editName || displayName)}
                    </Text>
                  </AvatarFallback>
                </Avatar>
                <View className='absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary'>
                  <Icon as={Camera} className='size-3.5 text-primary-foreground' />
                </View>
              </Pressable>

              <Input
                value={editName}
                onChangeText={setEditName}
                placeholder='Your name'
                className='w-full'
                autoCapitalize='words'
              />
            </View>

            <AlertDialogFooter>
              <AlertDialogCancel>
                <Text>Cancel</Text>
              </AlertDialogCancel>
              <AlertDialogAction onPress={saveProfile}>
                <Text>Save</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </View>

      <View className='px-4'>
        {/* Preferences */}
        <SettingsSection title='Preferences'>
          <SettingsRow
            icon={<Icon as={Bell} className='size-4 text-primary' />}
            label='Notifications'
            onPress={() => setNotificationsEnabled(!notificationsEnabled)}
            right={
              <View pointerEvents='none'>
                <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
              </View>
            }
          />
          <SettingsRow
            icon={<Icon as={ImageIcon} className='size-4 text-primary' />}
            label='Grade in notification'
            onPress={() => toggleGradeImage(!gradeImageNotifications)}
            right={
              <View pointerEvents='none'>
                <Switch checked={gradeImageNotifications} onCheckedChange={toggleGradeImage} />
              </View>
            }
          />
          <SettingsRow
            icon={<Icon as={BellRing} className='size-4 text-primary' />}
            label={sendingTest ? 'Sending…' : 'Send test notification'}
            onPress={sendTestNotification}
          />
          <SettingsRow
            icon={<Icon as={Moon} className='size-4 text-primary' />}
            label='Theme'
            right={
              <ToggleGroup
                type='single'
                value={themeMode}
                onValueChange={(value) => value && handleThemeModeChange(value as ThemeMode)}
                variant='outline'
              >
                <ToggleGroupItem value='light' isFirst>
                  <ToggleGroupIcon as={Sun} />
                </ToggleGroupItem>
                <ToggleGroupItem value='dark'>
                  <ToggleGroupIcon as={Moon} />
                </ToggleGroupItem>
                <ToggleGroupItem value='system' isLast>
                  <ToggleGroupIcon as={SmartphoneIcon} />
                </ToggleGroupItem>
              </ToggleGroup>
            }
          />
        </SettingsSection>

        {/* Appearance */}
        <SettingsSection title='Appearance'>
          <View className='gap-2 p-3'>
            <Text className='text-sm font-medium text-muted-foreground'>Color Theme</Text>
            <ColorThemePicker />
          </View>
          <SettingsRow
            icon={<Icon as={Palette} className='size-4 text-primary' />}
            label='Tab Bar Indicator'
            onPress={() => setTabBarIndicatorEnabled(!tabBarIndicatorEnabled)}
            right={
              <View pointerEvents='none'>
                <Switch checked={tabBarIndicatorEnabled} onCheckedChange={setTabBarIndicatorEnabled} />
              </View>
            }
          />
          <SettingsRow
            icon={<Icon as={LayoutGrid} className='size-4 text-primary' />}
            label='Grades View'
            right={
              <Select
                value={{
                  value: gradesView,
                  label: GRADES_VIEW_OPTIONS.find((o) => o.value === gradesView)?.label ?? 'List',
                }}
                onValueChange={(option) =>
                  option && setGradesView(option.value as 'list' | 'card')
                }
              >
                <SelectTrigger className='w-28'>
                  <SelectValue placeholder='View' className='text-sm text-foreground' />
                </SelectTrigger>
                <SelectContent>
                  {GRADES_VIEW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} label={option.label} />
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            icon={<Icon as={Type} className='size-4 text-primary' />}
            label='Number Display'
            right={
              <Select
                value={{
                  value: numberDisplay,
                  label: NUMBER_DISPLAY_OPTIONS.find((o) => o.value === numberDisplay)?.label ?? 'Decimal',
                }}
                onValueChange={(option) =>
                  option && setNumberDisplay(option.value as NumberDisplay)
                }
              >
                <SelectTrigger className='w-28'>
                  <SelectValue placeholder='Display' className='text-sm text-foreground' />
                </SelectTrigger>
                <SelectContent>
                  {NUMBER_DISPLAY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} label={`${option.label} (${option.desc})`} />
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            icon={<Icon as={Droplets} className='size-4 text-primary' />}
            label='Hide grade colors'
            onPress={() => setHideColors(!hideColors)}
            right={
              <View pointerEvents='none'>
                <Switch checked={hideColors} onCheckedChange={setHideColors} />
              </View>
            }
          />
          {/* <SettingsRow
            icon={<Icon as={Sparkles} className='size-4 text-primary' />}
            label='Enable animations'
            onPress={() => setAnimationsEnabled(!animationsEnabled)}
            right={
              <View pointerEvents='none'>
                <Switch checked={animationsEnabled} onCheckedChange={setAnimationsEnabled} />
              </View>
            }
          /> */}
        </SettingsSection>

        {/* Grades & data */}
        <SettingsSection title='Grades & Data'>
          <SettingsRow
            icon={<Icon as={Sparkles} className='size-4 text-primary' />}
            label='Show grade change banner'
            onPress={() => changeUserData('changeAlerts', !changeAlerts)}
            right={
              <View pointerEvents='none'>
                <Switch checked={changeAlerts} onCheckedChange={(v) => changeUserData('changeAlerts', v)} />
              </View>
            }
          />
          <SettingsRow
            icon={<Icon as={ListPlus} className='size-4 text-primary' />}
            label='Add missing work to to-dos'
            onPress={() => toggleAutoTodo(!autoTodoFromMissing)}
            right={
              <View pointerEvents='none'>
                <Switch checked={autoTodoFromMissing} onCheckedChange={toggleAutoTodo} />
              </View>
            }
          />
          <SettingsRow
            icon={<Icon as={Share2} className='size-4 text-primary' />}
            label='Export backup'
            onPress={exportBackup}
          />
          <SettingsRow
            icon={<Icon as={Copy} className='size-4 text-primary' />}
            label='Copy backup to clipboard'
            onPress={copyBackup}
          />
          <SettingsRow
            icon={<Icon as={ClipboardPaste} className='size-4 text-primary' />}
            label='Restore backup from clipboard'
            onPress={restoreFromClipboard}
          />
        </SettingsSection>

        {/* Account */}
        <SettingsSection title='Account'>
          <SettingsRow
            icon={<Icon as={User} className='size-4 text-primary' />}
            label='Account Details'
            onPress={() => router.push('/account' as any)}
          />
        </SettingsSection>

        {/* Danger zone */}
        <SettingsSection>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <SettingsRow
                icon={<Icon as={LogOut} className='size-4 text-destructive' />}
                label='Sign Out'
                destructive
              />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You'll need to sign in again to access your account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Text>Cancel</Text>
                </AlertDialogCancel>
                <Button
                  variant='destructive'
                  onPress={() => {
                    if (currentUserIndex >= 0) removeUser(currentUserIndex);
                    router.replace('/login');
                  }}
                >
                  <Text>Sign Out</Text>
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsSection>

        <Text className='mt-2 text-center text-xs text-muted-foreground'>
          Version 2.0.0
        </Text>
      </View>
    </ScrollView>
  );
}
