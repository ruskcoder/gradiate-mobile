import { ScreenHeader } from '@/components/custom/screen-header';
import { Spinner } from '@/components/custom/spinner';
import { Text } from '@/components/ui/text';
import { getInfo } from '@/lib/grades-api';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AccountInfo {
  username?: string;
  link?: string;
  name?: string;
  grade?: string;
  school?: string;
  dob?: string;
  counselor?: string;
  language?: string;
  cohortYear?: string;
  district?: string;
  numReferrals?: number;
}

// Same label-over-value card shape as `CategoryCard`'s rows on the grade
// detail page, minus the colored bar (there's no analogous accent here).
function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-full rounded-lg border border-border bg-card px-3 py-2">
      <Text className="font-medium" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-xl font-medium" numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const [info, setInfo] = React.useState<AccountInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getInfo();
        if (!cancelled && data.success) setInfo(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load account details');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fields: { label: string; value?: string | number }[] = info
    ? [
        { label: 'Name', value: info.name },
        { label: 'Username', value: info.username },
        { label: 'School', value: info.school },
        { label: 'District', value: info.district },
        { label: 'Grade', value: info.grade },
        { label: 'Cohort Year', value: info.cohortYear },
        { label: 'Counselor', value: info.counselor },
        { label: 'Language', value: info.language },
        { label: 'Date of Birth', value: info.dob },
        { label: 'Portal Link', value: info.link },
      ]
    : [];

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Account Details" />

      {loading && (
        <View className="flex-1 items-center justify-center gap-3">
          <Spinner size="large" />
          <Text className="text-muted-foreground">Loading account details...</Text>
        </View>
      )}

      {!loading && error && (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-destructive">{error}</Text>
        </View>
      )}

      {!loading && !error && info && (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 8 }}
          className="flex-1">
          {fields.map((field) => (
            <InfoCard key={field.label} label={field.label} value={String(field.value ?? '')} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
