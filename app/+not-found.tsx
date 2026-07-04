import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-4xl font-bold mb-4">Not Found</Text>
        <Text className="text-lg text-muted-foreground mb-8 text-center">
          Sorry, the page you're looking for doesn't exist.
        </Text>

        <Link href="/" asChild>
          <Text className="text-primary font-semibold">← Go back home</Text>
        </Link>
      </View>
    </>
  );
}
