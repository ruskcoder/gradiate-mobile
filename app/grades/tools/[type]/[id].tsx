import { HistoryContent } from '@/components/custom/tools/history-content';
import { ImpactsContent } from '@/components/custom/tools/impacts-content';
import { TimeTravelContent } from '@/components/custom/tools/timetravel-content';
import { TimelineContent } from '@/components/custom/tools/timeline-content';
import { WhatIfContent } from '@/components/custom/tools/whatif-content';
import { ScreenHeader } from '@/components/custom/screen-header';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useClassData } from '@/lib/use-class-data';
import { useCourseHistory } from '@/lib/use-course-history';
import { useStore } from '@/lib/store';
import { Spinner } from '@/components/custom/spinner';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ToolType } from '@/lib/tool-types';

const USES_LIVE_CLASS: Record<ToolType, boolean> = {
  whatif: true,
  impacts: true,
  history: false,
  timeline: false,
  timetravel: false,
};

export default function ToolDetailScreen() {
  const params = useLocalSearchParams<{
    type: ToolType;
    id: string;
    name?: string;
    average?: string;
    term?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type, id, name, average, term } = params;

  // Back always pops this screen and returns to the previous screen
  // (Grades list in tool mode, or the course detail page if accessed from there).
  // The Grades tab header handles exiting tool mode separately with its own back button.
  const exitToTools = React.useCallback(() => {
    router.back();
  }, [router]);

  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        exitToTools();
        return true;
      });
      return () => sub.remove();
    }, [exitToTools])
  );

  const wantsLiveClass = USES_LIVE_CLASS[type];
  const { classData, loading, error } = useClassData(
    wantsLiveClass ? id : undefined,
    name,
    average,
    wantsLiveClass ? term : undefined
  );
  // Impacts also shows a Grade History chart alongside the live class data,
  // so history is loaded unconditionally rather than only for the three
  // history-driven tools.
  const history = useCourseHistory(id, name, term);

  const title = classData?.name ?? name;

  if (wantsLiveClass && loading) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <Spinner />
      </View>
    );
  }

  if (wantsLiveClass && error) {
    return (
      <View className="flex-1 bg-background justify-center items-center px-4">
        <Text className="text-destructive text-center mb-4">{error}</Text>
        <Button onPress={exitToTools}>
          <Text>Go Back</Text>
        </Button>
      </View>
    );
  }

  if (!title) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <Text>Loading...</Text>
      </View>
    );
  }

  if (wantsLiveClass && !classData) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <Text>No data available</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={title} onBack={exitToTools} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 16, paddingHorizontal: 16 }}
        className="flex-1">
        {type === 'whatif' && classData && <WhatIfContent classData={classData} />}
        {type === 'impacts' && classData && <ImpactsContent classData={classData} history={history} />}
        {type === 'history' && <HistoryContent history={history} />}
        {type === 'timeline' && <TimelineContent history={history} />}
        {type === 'timetravel' && <TimeTravelContent history={history} />}
      </ScrollView>
    </View>
  );
}
