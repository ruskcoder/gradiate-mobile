import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Text } from '@/components/ui/text';
import { useAppSettings } from '@/lib/app-settings';
import { categoryColor } from '@/lib/grade-category-color';
import { formatGrade } from '@/lib/grade-display';
import * as React from 'react';
import { Pressable, View } from 'react-native';

export interface CategoryCardData {
  percent?: number;
  categoryWeight?: number;
  categoryPoints?: number;
  studentsPoints?: number;
  maximumPoints?: number;
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="flex-row items-center gap-4">
      <Text className="flex-1 text-sm font-medium">{label}:</Text>
      <Text className="text-sm text-muted-foreground">{value}</Text>
    </View>
  );
}

export const CategoryCard = React.memo(function CategoryCard({
  name,
  data,
}: {
  name: string;
  data: CategoryCardData;
}) {
  const { numberDisplay } = useAppSettings();
  const color = categoryColor(name);
  const numericPercent = parseFloat(String(data.percent ?? 0));
  const percent = formatGrade(numericPercent, numberDisplay);

  // Mirrors web CategoryGradeStat: Item variant="outline", name + big percent
  // on the left, colored bar (w-5 h-10) on the right. Press opens a detail dialog.
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Pressable className="w-full flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 active:bg-accent">
          <View className="min-w-0 flex-1 gap-0">
            <Text className="font-medium" numberOfLines={1} ellipsizeMode="tail">
              {name}
            </Text>
            <Text className="text-xl font-medium">{percent}</Text>
          </View>
          <View className="h-10 w-5 rounded-sm" style={{ backgroundColor: color }} />
        </Pressable>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{name}</AlertDialogTitle>
        </AlertDialogHeader>

        <View className="gap-3">
          <DetailRow label="Percent" value={percent} />
          {data.studentsPoints !== undefined && (
            <>
              <DetailRow label="Your Points" value={data.studentsPoints} />
              <DetailRow label="Max Points" value={data.maximumPoints ?? 0} />
            </>
          )}
          {data.categoryWeight !== undefined && (
            <>
              <DetailRow label="Weight" value={data.categoryWeight} />
              <DetailRow label="Category Points" value={data.categoryPoints ?? 0} />
            </>
          )}
        </View>
      </AlertDialogContent>
    </AlertDialog>
  );
});
