import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { Pressable, View } from 'react-native';

export function ListItemsList({ children }: { children: React.ReactNode }) {
  return <View className="w-full gap-2">{children}</View>;
}

interface ListItemProps {
  /** Background color for the leading square — a hex/rgb value or a theme CSS var. Falls back to the primary color. */
  squareColor?: string;
  /** Short text (e.g. initials, a day number) or an icon element shown in the square. */
  squareText?: React.ReactNode;
  title: string;
  desc?: string;
  onPress?: () => void;
  /** Optional trailing content (e.g. an action button), rendered right-aligned. */
  rightContent?: React.ReactNode;
}

export function ListItem({
  squareColor,
  squareText,
  title,
  desc,
  onPress,
  rightContent,
}: ListItemProps) {
  const bgColor = squareColor || 'var(--primary)';
  const isTextSquare = typeof squareText === 'string' || typeof squareText === 'number';

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'w-full flex-row items-center justify-between rounded-xl border border-border bg-card p-2',
        onPress && 'active:bg-accent'
      )}>
      <View className="mr-2 min-w-0 flex-1 flex-row items-center">
        <View
          className="mr-3 aspect-square h-11 items-center justify-center rounded-sm"
          style={{ backgroundColor: bgColor }}>
          {isTextSquare ? (
            <Text className="text-[1.35rem] font-semibold tracking-wide text-white">
              {squareText}
            </Text>
          ) : (
            squareText
          )}
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-semibold" numberOfLines={1}>
            {title}
          </Text>
          {!!desc && (
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {desc}
            </Text>
          )}
        </View>
      </View>
      {rightContent && <View className="ml-2 shrink-0">{rightContent}</View>}
    </Pressable>
  );
}
