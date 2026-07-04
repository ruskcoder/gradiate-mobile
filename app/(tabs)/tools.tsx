import { ListItem, ListItemsList } from '@/components/custom/list-item';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppSettings } from '@/lib/app-settings';
import { useStore } from '@/lib/store';
import { useColorScheme } from '@/lib/useColorScheme';
import type { ToolType } from '@/lib/tool-types';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Calculator,
  ChevronLeft,
  GraduationCap,
  ListOrdered,
  TrendingUp,
  Clock,
  Timeline,
  Zap,
  PencilRuler,
} from 'lucide-react-native';
import * as React from 'react';
import { BackHandler, View, ScrollView } from 'react-native';

export default function CalculatorsScreen() {
  const { showPageTitles } = useAppSettings();
  const { isDarkColorScheme } = useColorScheme();
  const router = useRouter();
  const setToolMode = useStore((s) => s.setToolMode);
  const params = useLocalSearchParams<{
    courseId?: string;
    courseName?: string;
    average?: string;
    term?: string;
  }>();
  // Launched from a course's detail page (Tools button in its header) —
  // the course is already known, so tool taps should jump straight to that
  // course's tool view instead of the usual "pick a course on Grades" flow.
  const fromCourse = !!params.courseId;

  // Reaching this tab via push replaces this screen's outer-stack entry
  // rather than sitting on top of it, so the course page it was launched
  // from is no longer in the back stack — a plain router.back() lands on
  // whatever the Grades tab's default state is, not the specific course.
  // Navigate back to that course explicitly instead.
  const exitToCourse = React.useCallback(() => {
    router.dismissTo({
      pathname: '/grades/[id]',
      params: {
        id: params.courseId!,
        name: params.courseName,
        average: params.average,
        term: params.term,
      },
    } as any);
  }, [router, params.courseId, params.courseName, params.average, params.term]);

  useFocusEffect(
    React.useCallback(() => {
      if (!fromCourse) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        exitToCourse();
        return true;
      });
      return () => sub.remove();
    }, [fromCourse, exitToCourse])
  );

  const openTool = (type: ToolType) => {
    if (fromCourse) {
      router.push({
        pathname: '/grades/tools/[type]/[id]',
        params: {
          type,
          id: params.courseId!,
          name: params.courseName,
          average: params.average,
          term: params.term,
        },
      });
      return;
    }
    // Puts the already-mounted Grades tab screen into tool mode (same list,
    // same in-flight/loaded state, just a different title + tap behavior) and
    // switches to it — no separate screen, no refetch.
    setToolMode(type);
    router.navigate('/grades' as any);
  };

  return (
    <View className="flex-1 bg-background">
      {(showPageTitles || fromCourse) && (
        <View className="flex-row items-center justify-between px-4 py-3">
          {showPageTitles ? <Text className="text-2xl font-bold">Tools</Text> : <View />}
          {fromCourse && (
            <Button onPress={exitToCourse} size="icon" variant="ghost" className="rounded-full">
              <Icon as={ChevronLeft} className="size-5" />
            </Button>
          )}
        </View>
      )}
      <ScrollView className="px-4" contentContainerStyle={{ paddingBottom: 128 }}>
        {/* Calculators Section */}
        <View className="mb-4">
          <Text className="text-lg font-semibold mb-3">Calculators</Text>
          <ListItemsList>
            {!fromCourse && (
              <>
                <ListItem
                  squareText={<Icon as={GraduationCap} className="size-5" color={isDarkColorScheme ? 'white' : 'black'} />}
                  title="GPA Calculator"
                  desc="Predict your GPA"
                  onPress={() => router.push('/calculators/gpa' as any)}
                />
                <ListItem
                  squareText={<Icon as={ListOrdered} className="size-5" color={isDarkColorScheme ? 'white' : 'black'} />}
                  title="Rank Calculator"
                  desc="Predict your class rank"
                  onPress={() => router.push('/calculators/rank' as any)}
                />
                <ListItem
                  squareText={<Icon as={PencilRuler} className="size-5" color={isDarkColorScheme ? 'white' : 'black'} />}
                  title="Final Exam Calculator"
                  desc="Figure out what you need on your final"
                  onPress={() => router.push('/calculators/final-exam' as any)}
                />
              </>
            )}
            <ListItem
              squareText={<Icon as={Calculator} className="size-5" color={isDarkColorScheme ? 'white' : 'black'} />}
              title="What If Calculator"
              desc="See how grades affect your average"
              onPress={() => openTool('whatif')}
            />
          </ListItemsList>
        </View>

        {/* Statistics & Analysis Section */}
        <View className="">
          <Text className="text-lg font-semibold mb-3">Statistics & Analysis</Text>
          <ListItemsList>
            <ListItem
              squareText={<Icon as={TrendingUp} className="size-5" color={isDarkColorScheme ? 'white' : 'black'} />}
              title="Impacts"
              desc="See how each assignment affects your grade"
              onPress={() => openTool('impacts')}
            />
            <ListItem
              squareText={<Icon as={Clock} className="size-5" color={isDarkColorScheme ? 'white' : 'black'} />}
              title="History"
              desc="View grade history over time"
              onPress={() => openTool('history')}
            />
            <ListItem
              squareText={<Icon as={Timeline} className="size-5" color={isDarkColorScheme ? 'white' : 'black'} />}
              title="Timeline"
              desc="See all grade changes in timeline view"
              onPress={() => openTool('timeline')}
            />
            <ListItem
              squareText={<Icon as={Zap} className="size-5" color={isDarkColorScheme ? 'white' : 'black'} />}
              title="TimeTravel"
              desc="View grades from any point in history"
              onPress={() => openTool('timetravel')}
            />
          </ListItemsList>
        </View>
      </ScrollView>
    </View>
  );
}
