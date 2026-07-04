import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { ScrollView, View } from 'react-native';

export interface SimpleTableColumn {
  key: string;
  label: string;
  width?: number;
}

interface SimpleTableProps {
  columns: SimpleTableColumn[];
  rows: Record<string, any>[];
  /** Override rendering for a given cell — return null/undefined to fall back to plain text. */
  renderCell?: (row: Record<string, any>, column: SimpleTableColumn) => React.ReactNode;
}

const DEFAULT_WIDTH = 96;

export function SimpleTable({ columns, rows, renderCell }: SimpleTableProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="overflow-hidden rounded-lg border border-border">
        <View className="flex-row border-b border-border bg-muted">
          {columns.map((col) => (
            <View
              key={col.key}
              className="justify-center px-2 py-2"
              style={{ width: col.width ?? DEFAULT_WIDTH }}>
              <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
                {col.label}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((row, rowIdx) => (
          <View
            key={rowIdx}
            className={cn(
              'flex-row',
              rowIdx !== rows.length - 1 && 'border-b border-border'
            )}>
            {columns.map((col) => (
              <View
                key={col.key}
                className="justify-center px-2 py-2"
                style={{ width: col.width ?? DEFAULT_WIDTH }}>
                {renderCell?.(row, col) ?? (
                  <Text className="text-xs" numberOfLines={1}>
                    {row[col.key] ?? ''}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
