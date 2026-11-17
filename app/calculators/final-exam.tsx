import { FinalExamClassic } from '@/components/custom/final-exam/classic';
import { FinalExamModern } from '@/components/custom/final-exam/modern';
import { ScreenHeader } from '@/components/custom/screen-header';
import { Checkbox } from '@/components/ui/checkbox';
import { Text } from '@/components/ui/text';
import { useCurrentUser, useStore } from '@/lib/store';
import * as React from 'react';
import { Pressable } from 'react-native';

/**
 * Final Exam Calculator. Users can fall back to the original UI from the
 * header; the choice is saved on their account.
 */
export default function FinalExamCalculatorScreen() {
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);
  const classic = user?.finalExamClassicUi ?? false;
  const setClassic = (value: boolean) => changeUserData('finalExamClassicUi', value);

  const header = (
    <ScreenHeader
      title="Final Exam Calculator"
      right={
        <Pressable onPress={() => setClassic(!classic)} className="flex-row items-center gap-2">
          <Checkbox checked={classic} onCheckedChange={setClassic} />
          <Text className="text-sm text-muted-foreground">Use old UI</Text>
        </Pressable>
      }
    />
  );

  return classic ? <FinalExamClassic header={header} /> : <FinalExamModern header={header} />;
}
