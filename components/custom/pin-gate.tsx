import { ScreenHeader } from '@/components/custom/screen-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { hashPin, PIN_PATTERN } from '@/lib/privacy-pin';
import { useCurrentUser, useStore } from '@/lib/store';
import { Lock } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);

export function usePrivacyLock() {
  const user = useCurrentUser();
  const unlocked = useStore((s) => s.privacyUnlocked);
  const setPrivacyUnlocked = useStore((s) => s.setPrivacyUnlocked);
  const locked = !!user?.privacyPinHash && !unlocked;
  const unlock = (pin: string) => {
    if (user?.privacyPinHash && hashPin(pin) === user.privacyPinHash) {
      setPrivacyUnlocked(true);
      return true;
    }
    return false;
  };
  return { locked, unlock };
}

export function PinPromptDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { unlock } = usePrivacyLock();
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    if (unlock(pin)) {
      setPin('');
      setError(null);
      onOpenChange(false);
    } else {
      setPin('');
      setError('Incorrect PIN');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90%]">
        <DialogHeader>
          <DialogTitle>Enter privacy PIN</DialogTitle>
          <DialogDescription>GPA, rank and transcripts are protected on this account.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={pin}
          onChangeText={(v) => {
            setPin(digits(v));
            setError(null);
          }}
          onSubmitEditing={submit}
          placeholder="PIN"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
        />
        {error && <Text className="text-sm text-destructive">{error}</Text>}
        <DialogFooter>
          <Button onPress={submit} disabled={!pin}>
            <Text>Unlock</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Screen-level gate: lock screen + PIN prompt until unlocked. */
export function PinGate({ title, children }: { title: string; children: React.ReactNode }) {
  const { locked } = usePrivacyLock();
  const [open, setOpen] = React.useState(true);
  if (!locked) return <>{children}</>;
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={title} />
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Icon as={Lock} className="size-10 text-muted-foreground" />
        <Text className="text-lg font-semibold">{title} is locked</Text>
        <Text className="text-center text-sm text-muted-foreground">Enter your privacy PIN to view it.</Text>
        <Button onPress={() => setOpen(true)}>
          <Text>Unlock</Text>
        </Button>
      </View>
      <PinPromptDialog open={open} onOpenChange={setOpen} />
    </View>
  );
}

/** Dialog to set, change or remove the privacy PIN. */
export function PrivacyPinDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);
  const setPrivacyUnlocked = useStore((s) => s.setPrivacyUnlocked);
  const hasPin = !!user?.privacyPinHash;
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const close = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    onOpenChange(false);
  };
  const verify = () => !hasPin || hashPin(current) === user?.privacyPinHash;

  const save = () => {
    if (!verify()) return setError('Current PIN is incorrect.');
    if (!PIN_PATTERN.test(next)) return setError('PIN must be 4–8 digits.');
    if (next !== confirm) return setError("PINs don't match.");
    changeUserData('privacyPinHash', hashPin(next));
    setPrivacyUnlocked(false);
    close();
  };

  const remove = () => {
    if (!verify()) return setError('Current PIN is incorrect.');
    changeUserData('privacyPinHash', '');
    close();
  };

  const field = (value: string, set: (v: string) => void, placeholder: string) => (
    <Input
      value={value}
      onChangeText={(v) => {
        set(digits(v));
        setError(null);
      }}
      placeholder={placeholder}
      keyboardType="number-pad"
      secureTextEntry
      maxLength={8}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="w-[90%]">
        <DialogHeader>
          <DialogTitle>Privacy PIN</DialogTitle>
          <DialogDescription>
            Require a PIN before GPA, rank or transcripts can be viewed. Locks again whenever you leave the app.
          </DialogDescription>
        </DialogHeader>
        <View className="gap-2">
          {hasPin && field(current, setCurrent, 'Current PIN')}
          {field(next, setNext, hasPin ? 'New PIN' : 'PIN (4–8 digits)')}
          {field(confirm, setConfirm, 'Confirm PIN')}
        </View>
        {error && <Text className="text-sm text-destructive">{error}</Text>}
        <DialogFooter>
          <Button onPress={save}>
            <Text>{hasPin ? 'Change PIN' : 'Set PIN'}</Text>
          </Button>
          {hasPin && (
            <Button variant="destructive" onPress={remove}>
              <Text>Remove PIN</Text>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
