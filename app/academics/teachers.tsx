import { ListItem, ListItemsList } from '@/components/custom/list-item';
import { ScreenHeader } from '@/components/custom/screen-header';
import { Spinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { getTeachers } from '@/lib/grades-api';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Teacher {
  teacher: string;
  email: string;
}

function getInitials(name: string) {
  if (!name) return '';
  const parts = name.split(',').map((p) => p.trim());
  if (parts.length === 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const words = name.split(' ');
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase();
}

export default function TeachersScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [copiedEmail, setCopiedEmail] = React.useState<number | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getTeachers();
        if (data.success && Array.isArray(data.teachers)) {
          // Email is optional — some portals (Skyward) don't expose it. Keep any
          // entry with a teacher name; dedupe by email when present, else by the
          // teacher/class pair so those portals still list every teacher.
          const seen = new Set<string>();
          const unique = data.teachers.filter((t: Teacher) => {
            if (!t.teacher) return false;
            const key = t.email || `${t.teacher}|${(t as any).class ?? ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setTeachers(unique);
        }
      } catch (e: any) {
        setError(e.message ?? 'Failed to fetch teachers');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCopyEmail = async (email: string, idx: number) => {
    await Clipboard.setStringAsync(email);
    setCopiedEmail(idx);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Teachers" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        className="flex-1">
        {loading && <Spinner className="py-8" />}
        {error && <Text className="py-8 text-center text-destructive">Error loading teachers: {error}</Text>}
        {!loading && !error && teachers.length === 0 && (
          <Text className="py-8 text-center text-muted-foreground">No teacher data available</Text>
        )}
        <ListItemsList>
          {teachers.map((teacher, idx) => (
            <ListItem
              key={idx}
              squareColor="var(--primary)"
              squareText={getInitials(teacher.teacher)}
              title={teacher.teacher}
              desc={teacher.email || (teacher as any).class || ''}
              rightContent={
                teacher.email ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onPress={() => handleCopyEmail(teacher.email, idx)}>
                  {copiedEmail === idx ? (
                    <Icon as={Check} className="size-4 text-green-600" />
                  ) : (
                    <Icon as={Copy} className="size-4" />
                  )}
                </Button>
                ) : undefined
              }
            />
          ))}
        </ListItemsList>
      </ScrollView>
    </View>
  );
}
