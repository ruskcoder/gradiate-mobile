import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { DEFAULT_COLOR_THEME_ID, getColorThemeById } from '@/lib/color-themes';
import { toHex } from '@/lib/resolve-theme-color';
import { useCurrentUser } from '@/lib/store';
import { cn } from '@/lib/utils';
import * as Haptics from 'expo-haptics';
import { Clock } from 'lucide-react-native';
import * as React from 'react';
import { PanResponder, Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { useUniwind } from 'uniwind';

// --- time <-> string helpers ---------------------------------------------

function parseTimeString(value: string): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) {
    date.setHours(8, 0);
    return date;
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  date.setHours(hours, minutes);
  return date;
}

type Meridiem = 'AM' | 'PM';

function parseParts(value: string): { hour: number; minute: number; meridiem: Meridiem } {
  const d = parseTimeString(value);
  let hour = d.getHours();
  const meridiem: Meridiem = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return { hour, minute: d.getMinutes(), meridiem };
}

function formatParts(hour: number, minute: number, meridiem: Meridiem): string {
  return `${hour}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

function haptic() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

// --- theme colours for the SVG (classNames can't reach stroke/fill) -------

function useClockColors() {
  const { theme: mode } = useUniwind();
  const user = useCurrentUser();
  const theme = getColorThemeById(user?.colorTheme ?? DEFAULT_COLOR_THEME_ID);
  const vars = (mode === 'dark' ? theme?.json.cssVars.dark : theme?.json.cssVars.light) ?? {};
  const pick = (key: string, fallback: string) => (vars[key] ? toHex(vars[key]) : fallback);
  return {
    primary: pick('primary', '#2563eb'),
    primaryForeground: pick('primary-foreground', '#ffffff'),
    foreground: pick('foreground', '#111827'),
    mutedForeground: pick('muted-foreground', '#6b7280'),
    face: pick('secondary', '#f1f5f9'),
  };
}

// --- radial clock face ----------------------------------------------------

const SIZE = 260;
const CENTER = SIZE / 2;
const NUM_RADIUS = 104; // ring where the numbers / knob sit
const KNOB_RADIUS = 20;
const HUB_RADIUS = 4;

type Mode = 'hours' | 'minutes';

/** Position of a value on the ring. `steps` = values in a full turn (12 for
 *  hours, 60 for minutes). 12 o'clock / 0 min sits at the top, going
 *  clockwise. */
function pointFor(value: number, steps: number, radius: number) {
  const theta = (value * (360 / steps) * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(theta), y: CENTER - radius * Math.cos(theta) };
}

/** Inverse of `pointFor`: touch coordinates (relative to the face) -> value. */
function valueFor(x: number, y: number, steps: number) {
  let deg = (Math.atan2(x - CENTER, CENTER - y) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return Math.round(deg / (360 / steps)) % steps;
}

const HOUR_LABELS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTE_LABELS = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,..55

function ClockFace({
  mode,
  hour,
  minute,
  colors,
  onPickHour,
  onPickMinute,
  onHourReleased,
}: {
  mode: Mode;
  hour: number;
  minute: number;
  colors: ReturnType<typeof useClockColors>;
  onPickHour: (h: number) => void;
  onPickMinute: (m: number) => void;
  onHourReleased: () => void;
}) {
  const selected = mode === 'hours' ? hour : minute;
  const steps = mode === 'hours' ? 12 : 60;
  const hand = pointFor(mode === 'hours' ? hour % 12 : minute, steps, NUM_RADIUS);

  // The PanResponder is created once, so read live props/state through a ref
  // to avoid stale closures when `mode` flips from hours to minutes.
  const lastValueRef = React.useRef<number | null>(null);
  const api = React.useRef({ mode, onPickHour, onPickMinute, onHourReleased });
  api.current = { mode, onPickHour, onPickMinute, onHourReleased };

  // Work in window coordinates (`pageX/pageY`) relative to the face's measured
  // origin. `locationX/locationY` are relative to whichever view is under the
  // finger, so once the drag leaves the face (e.g. over the OK/Cancel buttons)
  // they jump to a different frame and the angle flips ~180°.
  const viewRef = React.useRef<View>(null);
  const originRef = React.useRef({ x: 0, y: 0 });

  const applyPoint = React.useCallback((pageX: number, pageY: number) => {
    const x = pageX - originRef.current.x;
    const y = pageY - originRef.current.y;
    const { mode: m, onPickHour: ph, onPickMinute: pm } = api.current;
    if (m === 'hours') {
      let h = valueFor(x, y, 12);
      if (h === 0) h = 12;
      if (h !== lastValueRef.current) {
        lastValueRef.current = h;
        haptic();
        ph(h);
      }
    } else {
      const min = valueFor(x, y, 60);
      if (min !== lastValueRef.current) {
        lastValueRef.current = min;
        haptic();
        pm(min);
      }
    }
  }, []);

  const responder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        lastValueRef.current = null;
        const { pageX, pageY } = e.nativeEvent;
        viewRef.current?.measureInWindow((x, y) => {
          originRef.current = { x, y };
          applyPoint(pageX, pageY);
        });
      },
      onPanResponderMove: (e) => applyPoint(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: () => {
        if (api.current.mode === 'hours') api.current.onHourReleased();
      },
    })
  ).current;

  const labels = mode === 'hours' ? HOUR_LABELS : MINUTE_LABELS;

  return (
    <View
      ref={viewRef}
      style={{ width: SIZE, height: SIZE }}
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={mode === 'hours' ? 'Select hour' : 'Select minute'}>
      <Svg width={SIZE} height={SIZE} pointerEvents="none">
        {/* face */}
        <Circle cx={CENTER} cy={CENTER} r={CENTER} fill={colors.face} />
        {/* hand + knob */}
        <Line
          x1={CENTER}
          y1={CENTER}
          x2={hand.x}
          y2={hand.y}
          stroke={colors.primary}
          strokeWidth={2}
        />
        <Circle cx={hand.x} cy={hand.y} r={KNOB_RADIUS} fill={colors.primary} />
        {/* a minute that has no numeral gets a small dot inside the knob */}
        {mode === 'minutes' && minute % 5 !== 0 && (
          <Circle cx={hand.x} cy={hand.y} r={2.5} fill={colors.primaryForeground} />
        )}
        <Circle cx={CENTER} cy={CENTER} r={HUB_RADIUS} fill={colors.primary} />
        {/* numerals */}
        {labels.map((n) => {
          const p = pointFor(mode === 'hours' ? n % 12 : n, steps, NUM_RADIUS);
          const isSelected = n === selected;
          return (
            <SvgText
              key={n}
              x={p.x}
              y={p.y}
              dy={6}
              fontSize={16}
              fontWeight={isSelected ? '600' : '400'}
              textAnchor="middle"
              fill={isSelected ? colors.primaryForeground : colors.foreground}>
              {mode === 'hours' ? n : String(n).padStart(2, '0')}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

// --- header digits + AM/PM ------------------------------------------------

function DigitSegment({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'items-center justify-center rounded-md px-3',
        active ? 'bg-primary/10' : 'bg-muted'
      )}>
      <Text
        className={cn(
          'text-5xl font-light leading-none',
          active ? 'text-primary' : 'text-foreground'
        )}>
        {label}
      </Text>
    </Pressable>
  );
}

function MeridiemSegment({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'items-center justify-center rounded-md border px-3 py-1.5',
        active ? 'border-primary bg-primary/10' : 'border-border'
      )}>
      <Text className={cn('text-sm font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

// --- public component -----------------------------------------------------

function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const colors = useClockColors();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>('hours');
  const [hour, setHour] = React.useState(8);
  const [minute, setMinute] = React.useState(0);
  const [meridiem, setMeridiem] = React.useState<Meridiem>('AM');

  const openDialog = () => {
    const p = parseParts(value);
    setHour(p.hour);
    setMinute(p.minute);
    setMeridiem(p.meridiem);
    setMode('hours');
    setOpen(true);
  };

  const confirm = () => {
    onChange(formatParts(hour, minute, meridiem));
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        className={cn('h-10 flex-row items-center justify-between gap-2 px-3', className)}
        onPress={openDialog}>
        <Text className={cn('text-sm', !value && 'text-muted-foreground')} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Icon as={Clock} className="text-muted-foreground size-4 shrink-0" />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-[340px] items-stretch gap-4">
          <AlertDialogTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wider">
            Select time
          </AlertDialogTitle>

          <View className="flex-row items-stretch justify-center gap-1.5">
            <DigitSegment
              active={mode === 'hours'}
              label={String(hour)}
              onPress={() => setMode('hours')}
            />
            <Text className="text-foreground self-center text-4xl font-light">:</Text>
            <DigitSegment
              active={mode === 'minutes'}
              label={String(minute).padStart(2, '0')}
              onPress={() => setMode('minutes')}
            />
            <View className="ml-2 gap-1">
              <MeridiemSegment
                active={meridiem === 'AM'}
                label="AM"
                onPress={() => setMeridiem('AM')}
              />
              <MeridiemSegment
                active={meridiem === 'PM'}
                label="PM"
                onPress={() => setMeridiem('PM')}
              />
            </View>
          </View>

          <View className="items-center py-1">
            <ClockFace
              mode={mode}
              hour={hour}
              minute={minute}
              colors={colors}
              onPickHour={setHour}
              onPickMinute={setMinute}
              onHourReleased={() => setMode('minutes')}
            />
          </View>

          <View className="flex-row justify-end gap-2">
            <Button variant="ghost" onPress={() => setOpen(false)}>
              <Text className="text-primary">Cancel</Text>
            </Button>
            <Button variant="ghost" onPress={confirm}>
              <Text className="text-primary">OK</Text>
            </Button>
          </View>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { TimePicker };
