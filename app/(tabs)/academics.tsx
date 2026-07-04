import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ListItem, ListItemsList } from '@/components/custom/list-item';
import { useAppSettings } from '@/lib/app-settings';
import { useColorScheme } from '@/lib/useColorScheme';
import { useRouter } from 'expo-router';
import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Clock,
  FileCheck,
  School,
  Users,
} from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACADEMICS_PAGES = [
  {
    title: 'Attendance',
    desc: 'Absences, tardies, and events by month',
    href: '/academics/attendance',
    icon: CalendarCheck,
  },
  {
    title: 'Schedules',
    desc: 'Class schedule by period',
    href: '/academics/schedules',
    icon: Clock,
  },
  {
    title: 'Bell Schedule',
    desc: 'Period times for each schedule',
    href: '/academics/bell-schedule',
    icon: School,
  },
  {
    title: 'Transcripts',
    desc: 'Rank, GPA, and course history by year',
    href: '/academics/transcripts',
    icon: BookOpen,
  },
  {
    title: 'Report Card',
    desc: 'Grades by marking period',
    href: '/academics/report-card',
    icon: FileCheck,
  },
  {
    title: 'Progress Report',
    desc: 'Interim grades and comments',
    href: '/academics/progress-report',
    icon: ClipboardList,
  },
  {
    title: 'Teachers',
    desc: 'Contact info for your teachers',
    href: '/academics/teachers',
    icon: Users,
  },
] as const;

export default function AcademicsScreen() {
  const { showPageTitles } = useAppSettings();
  const { isDarkColorScheme } = useColorScheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      {showPageTitles && (
        <View className="px-4 py-3">
          <Text className="text-2xl font-bold">Academics</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        className="flex-1 px-4">
        <ListItemsList>
          {ACADEMICS_PAGES.map((page) => (
            <ListItem
              key={page.href}
              squareText={<Icon as={page.icon} className="size-5" color={isDarkColorScheme ? 'white' : 'black'} />}
              title={page.title}
              desc={page.desc}
              onPress={() => router.push(page.href as any)}
            />
          ))}
        </ListItemsList>
      </ScrollView>
    </View>
  );
}
