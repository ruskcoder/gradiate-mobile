import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

export function ScreenHeader({
  title,
  right,
  onBack,
}: {
  title: string;
  right?: React.ReactNode;
  /** Overrides the default `router.back()` — used where "back" should exit
   *  to a specific screen instead of popping the stack (e.g. Tools). */
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-2 rounded-full"
        onPress={onBack ?? (() => router.back())}>
        <Icon as={ArrowLeft} className="size-6 text-foreground" />
      </Button>
      <Text className="flex-1 text-xl font-bold" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
