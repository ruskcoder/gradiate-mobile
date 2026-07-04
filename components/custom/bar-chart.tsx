import { Text } from '@/components/ui/text';
import * as React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export interface BarChartPoint {
  label: string;
  value: number;
}

const CHART_HEIGHT = 160;
const BAR_RADIUS = 4;

/**
 * A minimal bar chart mirroring the recharts `<BarChart>` used on web for
 * Grade History/Impacts (flat top-rounded bars, thin gridline baseline, axis
 * labels underneath). Built with react-native-svg rather than pulling in a
 * full charting library, since only a single flat-color bar series is ever
 * needed here.
 */
export function BarChart({ data, color = '#3b82f6' }: { data: BarChartPoint[]; color?: string }) {
  const [width, setWidth] = React.useState(0);
  if (data.length === 0) return null;

  const maxValue = Math.max(100, ...data.map((d) => d.value));
  const gap = 8;
  const barWidth = width > 0 ? Math.max(4, (width - gap * (data.length - 1)) / data.length) : 0;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ height: CHART_HEIGHT }} className="border-b border-border">
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            {data.map((d, i) => {
              const barHeight = Math.max(2, (d.value / maxValue) * (CHART_HEIGHT - 4));
              const x = i * (barWidth + gap);
              const y = CHART_HEIGHT - barHeight;
              return (
                <Rect
                  key={i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={BAR_RADIUS}
                  ry={BAR_RADIUS}
                  fill={color}
                />
              );
            })}
          </Svg>
        )}
      </View>
      <View className="mt-1 flex-row justify-between">
        <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
          {data[0]?.label}
        </Text>
        {data.length > 1 && (
          <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
            {data[data.length - 1]?.label}
          </Text>
        )}
      </View>
    </View>
  );
}
