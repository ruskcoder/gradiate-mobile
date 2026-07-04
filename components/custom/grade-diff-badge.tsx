import { Text } from '@/components/ui/text';
import { View } from 'react-native';

export function GradeDiffBadge({ difference }: { difference: number }) {
  const bg = difference > 0 ? '#dcfce7' : difference < 0 ? '#fee2e2' : '#f3f4f6';
  const fg = difference > 0 ? '#15803d' : difference < 0 ? '#b91c1c' : '#374151';
  return (
    <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: bg }}>
      <Text className="text-[10px] font-semibold" style={{ color: fg }}>
        {difference > 0 ? '+' : ''}
        {difference.toFixed(1)}%
      </Text>
    </View>
  );
}
