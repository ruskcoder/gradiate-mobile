import {
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import { Edit, Save, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import type { AssignmentScore } from '@/components/custom/assignment-card';

const BADGE_COLORS: Record<string, string> = {
  missing: 'bg-red-500',
  exempt: 'bg-sky-500',
  dropped: 'bg-gray-400',
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-4">
      <Text className="flex-1 text-sm font-medium">{label}:</Text>
      <Text className="text-sm text-muted-foreground">{value}</Text>
    </View>
  );
}

export function AssignmentDetailDialog({
  score,
  onRemove,
  onToggleExcluded,
  onEditPercentage,
}: {
  score: AssignmentScore;
  onRemove?: () => void;
  onToggleExcluded?: () => void;
  onEditPercentage?: (newPercentage: number | '') => void;
}) {
  const { onOpenChange } = AlertDialogPrimitive.useRootContext();
  const [isEditing, setIsEditing] = React.useState(false);
  const [editingPercentage, setEditingPercentage] = React.useState(
    score.percentage !== null && score.percentage !== undefined ? String(score.percentage) : ''
  );

  const handleSavePercentage = () => {
    const raw = editingPercentage.trim();
    if (raw === '') {
      onEditPercentage?.('');
    } else {
      const parsed = parseFloat(raw.replace('%', ''));
      onEditPercentage?.(!isNaN(parsed) ? parsed : 0);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    onOpenChange(false);
    onRemove?.();
  };

  return (
    <AlertDialogContent>
      <AlertDialogHeader className="flex-row items-center gap-4 space-y-0">
        <AlertDialogTitle className={cn('flex-1', score.excluded && 'line-through')} numberOfLines={1}>
          {score.name}
        </AlertDialogTitle>
        {score.percentage !== undefined && onEditPercentage && (
          <Button
            variant="outline"
            size="icon"
            onPress={isEditing ? handleSavePercentage : () => setIsEditing(true)}>
            <Icon as={isEditing ? Save : Edit} className="size-4" />
          </Button>
        )}
      </AlertDialogHeader>

      <View className="gap-3">
        <DetailRow label="Category" value={score.category} />
        <DetailRow label="Due Date" value={score.dateDue} />
        {score.dateAssigned && <DetailRow label="Assigned" value={score.dateAssigned} />}
        {score.score !== null && score.score !== undefined && (
          <DetailRow label="Score" value={parseFloat(String(score.score)).toFixed(2)} />
        )}
        {score.totalPoints !== undefined && (
          <DetailRow label="Max Points" value={String(score.totalPoints)} />
        )}
        {score.percentage !== null && score.percentage !== undefined && (
          <View className="flex-row items-center gap-4">
            <Text className="flex-1 text-sm font-medium">Percentage:</Text>
            {isEditing ? (
              <Input
                value={editingPercentage}
                onChangeText={setEditingPercentage}
                keyboardType="decimal-pad"
                className="h-8 w-24"
                autoFocus
              />
            ) : (
              <Text className="text-sm text-muted-foreground">
                {parseFloat(String(score.percentage)).toFixed(2)}%
              </Text>
            )}
          </View>
        )}
        {score.weight !== undefined && <DetailRow label="Weight" value={String(score.weight)} />}
        {score.badges.length > 0 && (
          <View className="flex-row items-center gap-4">
            <Text className="flex-1 text-sm font-medium">Badges:</Text>
            <View className="flex-row gap-1">
              {score.badges.map((badge) => (
                <View
                  key={badge}
                  className={cn('rounded px-1.5 py-0.5', BADGE_COLORS[badge] ?? 'bg-gray-400')}>
                  <Text className="text-xs font-bold text-white">{badge.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {(onToggleExcluded || onRemove) && (
        <View className="flex-row gap-2">
          {onToggleExcluded && (
            <Pressable
              onPress={() => onToggleExcluded()}
              className="flex-1 flex-row items-center justify-between gap-3 rounded-lg border border-border p-2 active:bg-accent">
              <Text className="text-sm font-medium">Disable</Text>
              <Switch checked={score.excluded ?? false} onCheckedChange={onToggleExcluded} pointerEvents="none" />
            </Pressable>
          )}
          {onRemove && (
            <Button variant="destructive" className="flex-1 flex-row gap-2" onPress={handleDelete}>
              <Icon as={Trash2} className="size-4" />
              <Text>Delete</Text>
            </Button>
          )}
        </View>
      )}
    </AlertDialogContent>
  );
}
