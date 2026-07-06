import { Spinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as DialogPrimitive from '@rn-primitives/dialog';
import * as React from 'react';
import { Image, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';

export type MfaIcon = {
  id: number;
  name: string;
  short_name: string;
  imageUrl?: string;
};

/**
 * The ClassLink two-factor prompt. Rendered when a `classlinkCredentials` login
 * comes back `{ mfaRequired: true }`. Two variants:
 *   - `pin`   : a 6-digit numeric entry.
 *   - `image` : a grid of candidate icons; tapping one submits its filename.
 *
 * It's a modal (rnr Dialog primitive) rather than an anchored popover because
 * the image grid needs real space. Styled as a light surface to match the
 * always-light login card it sits over.
 */
export function MfaPrompt({
  open,
  mfaType,
  icons,
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  mfaType: 'pin' | 'image';
  icons?: MfaIcon[];
  loading?: boolean;
  error?: string | null;
  onSubmit: (answer: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = React.useState('');

  // Clear the PIN whenever the prompt (re)opens so a stale value never lingers.
  React.useEffect(() => {
    if (open) setPin('');
  }, [open, mfaType]);

  const canSubmitPin = !loading && pin.length >= 4;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="absolute bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center bg-black/50 p-4"
          asChild={Platform.OS !== 'web'}>
          <NativeOnlyAnimatedView entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <DialogPrimitive.Content className="mx-auto w-full max-w-[440px] rounded-2xl border border-black/10 bg-white p-6 shadow-lg shadow-black/10">
              <Text className="text-center text-lg font-semibold text-black">
                Two-Factor Verification
              </Text>
              <Text className="mt-1 text-center text-sm text-black/60">
                {mfaType === 'pin'
                  ? 'Enter your ClassLink PIN to continue.'
                  : 'Select your secret ClassLink image to continue.'}
              </Text>

              {error ? (
                <Text className="mt-3 text-center text-sm text-red-600">{error}</Text>
              ) : null}

              {mfaType === 'pin' ? (
                <View className="mt-4 gap-3">
                  <TextInput
                    value={pin}
                    onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="••••••"
                    placeholderTextColor="#9ca3af"
                    keyboardType="number-pad"
                    secureTextEntry
                    autoFocus
                    editable={!loading}
                    onSubmitEditing={() => canSubmitPin && onSubmit(pin)}
                    className="w-full rounded-md border border-black/15 bg-white px-3 text-center text-2xl tracking-[8px] text-black"
                    style={{ height: 52 }}
                  />
                  <View className="flex-row gap-2">
                    <Button
                      variant="outline"
                      disabled={loading}
                      onPress={onCancel}
                      style={{ backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.12)' }}>
                      <Text className="text-black">Cancel</Text>
                    </Button>
                    <Button
                      className="flex-1 flex-row gap-2"
                      disabled={!canSubmitPin}
                      onPress={() => onSubmit(pin)}>
                      {loading && <Spinner size="small" color="#fff" />}
                      <Text>Verify</Text>
                    </Button>
                  </View>
                </View>
              ) : (
                <View className="mt-4">
                  <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                    <View className="flex-row flex-wrap justify-center gap-3">
                      {(icons || []).map((icon) => (
                        <Pressable
                          key={icon.id}
                          disabled={loading}
                          onPress={() => onSubmit(icon.name)}
                          className={cn(
                            'w-[90px] items-center rounded-xl border border-black/10 bg-black/[0.02] p-2 active:bg-black/[0.06]',
                            loading && 'opacity-50'
                          )}>
                          <Image
                            source={{ uri: icon.imageUrl }}
                            style={{ width: 44, height: 44 }}
                            resizeMode="contain"
                          />
                          <Text
                            className="mt-1 text-center text-[11px] text-black/60"
                            numberOfLines={1}>
                            {icon.short_name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                  <View className="mt-4 flex-row items-center justify-center gap-2">
                    {loading && <Spinner size="small" color="#000" />}
                    <Button
                      variant="outline"
                      disabled={loading}
                      onPress={onCancel}
                      style={{ backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.12)' }}>
                      <Text className="text-black">Cancel</Text>
                    </Button>
                  </View>
                </View>
              )}
            </DialogPrimitive.Content>
          </NativeOnlyAnimatedView>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
