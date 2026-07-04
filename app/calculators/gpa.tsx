import { ScreenHeader } from '@/components/custom/screen-header';
import { Spinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { GPA_CONFIGS } from '@/lib/gpa-configs';
import { getTranscript } from '@/lib/grades-api';
import { useCurrentUser, useStore } from '@/lib/store';
import { Plus, RotateCcw, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type WeightedGpaType = 'katyWeighted' | 'cyFairWeighted';
type GpaType = WeightedGpaType | 'unweighted';

interface Course {
  id: number;
  uniqueId: string;
  source: 'transcript' | 'custom';
  courseCode: string;
  courseName: string;
  grade: string | number;
  type: string;
  isDeleted: boolean;
  schoolYear?: string;
  year?: string;
}

function determineDefaultCourseType(courseCode: string, courseName: string) {
  const code = courseCode.toLowerCase();
  const name = courseName.toLowerCase();
  if (code.startsWith('a') || name.includes('ap')) return 'AP';
  if (name.includes('honors') || name.includes('kap')) return 'KAP';
  if (name.includes('dual') || name.includes('college')) return 'DC';
  return '';
}

function DiffChip({ value, precision }: { value: number; precision: number }) {
  const bg = value > 0 ? '#dcfce7' : value < 0 ? '#fee2e2' : '#f3f4f6';
  const fg = value > 0 ? '#15803d' : value < 0 ? '#b91c1c' : '#374151';
  return (
    <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: bg }}>
      <Text className="text-xs font-semibold" style={{ color: fg }}>
        {value > 0 ? '+' : ''}
        {value.toFixed(precision)}
      </Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  colorClass,
  children,
}: {
  label: string;
  value: string;
  colorClass: string;
  children?: React.ReactNode;
}) {
  return (
    <View className={`flex-1 gap-1 rounded-lg border p-3 ${colorClass}`}>
      <Text className="text-xs font-medium opacity-80">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Text className="text-xl font-bold">{value}</Text>
        {children}
      </View>
    </View>
  );
}

export default function GPACalculatorScreen() {
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);

  const [loading, setLoading] = React.useState(true);
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [gpaType, setGpaType] = React.useState<GpaType>('katyWeighted');
  const [defaultGpaType, setDefaultGpaType] = React.useState<WeightedGpaType>('katyWeighted');
  const [transcriptGPA, setTranscriptGPA] = React.useState<number | null>(null);
  const [unweightedTranscriptGPA, setUnweightedTranscriptGPA] = React.useState<number | null>(null);
  const nextCourseId = React.useRef(1);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);

        let gpaTypeToUse: WeightedGpaType = 'katyWeighted';
        if (user?.district?.toLowerCase().includes('cypress')) gpaTypeToUse = 'cyFairWeighted';

        const data = await getTranscript();
        if (cancelled || !data.success || !data.transcriptData) return;

        let weighted: number | null = null;
        let unweighted: number | null = null;
        if (data.transcriptData['Weighted GPA*']) {
          weighted = parseFloat(data.transcriptData['Weighted GPA*']);
        }
        if (data.transcriptData['Unweighted GPA*']) {
          unweighted = parseFloat(data.transcriptData['Unweighted GPA*']);
        }
        setTranscriptGPA(weighted);
        setUnweightedTranscriptGPA(unweighted);

        let id = 1;
        const parsedCourses: Course[] = [];
        for (const [semesterKey, semester] of Object.entries<any>(data.transcriptData)) {
          if (
            semesterKey === 'Weighted GPA*' ||
            semesterKey === 'Unweighted GPA*' ||
            semesterKey === 'rank' ||
            semesterKey === 'quartile'
          ) {
            continue;
          }
          const semesterData = semester?.data || [];
          for (let i = 1; i < semesterData.length; i++) {
            const row = semesterData[i];
            const courseCode = row[0] || '';
            const courseName = row[1] || '';
            const gradeStr = row[2] || '';
            parsedCourses.push({
              id,
              uniqueId: `t-${id}`,
              source: 'transcript',
              courseCode,
              courseName,
              grade: parseInt(gradeStr) || 0,
              type: determineDefaultCourseType(courseCode, courseName),
              isDeleted: !!user?.deletedTranscriptCourses?.includes(
                `${courseCode}-${courseName}-${semesterKey}`
              ),
              schoolYear: semesterKey,
              year: semester.year,
            });
            id++;
          }
        }
        nextCourseId.current = id;

        let allCourses = parsedCourses;
        if (user?.courseTypesByCourseName) {
          allCourses = allCourses.map((c) => {
            const stored = user.courseTypesByCourseName[c.courseName];
            return stored ? { ...c, type: stored } : c;
          });
        }

        if (user?.customCourses?.length) {
          const customCourses: Course[] = user.customCourses.map((c, idx) => ({
            id: nextCourseId.current + idx,
            uniqueId: `c-${nextCourseId.current + idx}`,
            source: 'custom',
            courseCode: '',
            courseName: c.courseName,
            grade: c.grade,
            type: c.type,
            isDeleted: false,
          }));
          allCourses = [...customCourses, ...allCourses];
          nextCourseId.current += user.customCourses.length;
        }

        setCourses(allCourses);
        setDefaultGpaType(gpaTypeToUse);
        setGpaType(gpaTypeToUse);
      } catch (e) {
        console.error('Failed to load transcript for GPA calculator', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCourseTypes = React.useCallback(() => {
    const config = GPA_CONFIGS[gpaType];
    if (!config) return [];
    return Object.keys(config.classes).filter((type) => type !== '*');
  }, [gpaType]);

  const gradeToLetter = React.useCallback(
    (grade: string | number) => {
      const labels = GPA_CONFIGS[gpaType]?.labels || {};
      if (typeof grade === 'string' && Object.keys(labels).includes(grade.toUpperCase())) {
        return grade.toUpperCase();
      }
      const num = parseInt(String(grade));
      if (isNaN(num)) return '';
      for (const [letter, range] of Object.entries(labels)) {
        const [min, max] = range.split('-').map(Number);
        if (num >= min && num <= max) return letter;
      }
      return '';
    },
    [gpaType]
  );

  const calculateCourseGPA = React.useCallback(
    (grade: string | number, courseType: string) => {
      const letter = gradeToLetter(grade);
      if (!letter) return null;
      const config = GPA_CONFIGS[gpaType];
      if (!config) return null;
      const typeConfig = config.classes[courseType] || config.classes['*'];
      const gpaValue = typeConfig?.[letter];
      return gpaValue !== undefined ? gpaValue : null;
    },
    [gpaType, gradeToLetter]
  );

  const calculateGPA = React.useCallback(
    (coursesToCalc: Course[], excludeDeleted = true) => {
      const validCourses = coursesToCalc.filter((c) => {
        if (excludeDeleted && c.isDeleted) return false;
        return !!c.grade;
      });
      if (validCourses.length === 0) return 0;
      let totalGPA = 0;
      let totalWeight = 0;
      for (const course of validCourses) {
        const courseGPA = calculateCourseGPA(course.grade, course.type);
        if (courseGPA !== null) {
          totalGPA += courseGPA;
          totalWeight += 1;
        }
      }
      return totalWeight > 0 ? totalGPA / totalWeight : 0;
    },
    [calculateCourseGPA]
  );

  const persistCustomCourses = (updated: Course[]) => {
    const customCourses = updated
      .filter((c) => c.source === 'custom' && !c.isDeleted)
      .map((c) => ({ courseName: c.courseName, grade: String(c.grade), type: c.type }));
    changeUserData('customCourses', customCourses);
  };

  const addCustomCourse = () => {
    const newCourse: Course = {
      id: nextCourseId.current,
      uniqueId: `c-${nextCourseId.current}`,
      source: 'custom',
      courseCode: '',
      courseName: '',
      grade: '',
      type: '',
      isDeleted: false,
    };
    setCourses((prev) => {
      const updated = [newCourse, ...prev];
      persistCustomCourses(updated);
      return updated;
    });
    nextCourseId.current += 1;
  };

  const updateCourse = (courseId: string, field: 'courseName' | 'grade' | 'type', value: string) => {
    setCourses((prev) => {
      if (field === 'type') {
        const target = prev.find((c) => c.uniqueId === courseId);
        if (target?.courseName) {
          const courseTypesByCourseName = user?.courseTypesByCourseName || {};
          changeUserData('courseTypesByCourseName', {
            ...courseTypesByCourseName,
            [target.courseName]: value,
          });
          const updated = prev.map((c) =>
            c.courseName === target.courseName ? { ...c, type: value } : c
          );
          persistCustomCourses(updated);
          return updated;
        }
      }
      const updated = prev.map((c) => (c.uniqueId === courseId ? { ...c, [field]: value } : c));
      persistCustomCourses(updated);
      return updated;
    });
  };

  const toggleDeleteCourse = (courseId: string) => {
    setCourses((prev) => {
      const updated = prev
        .map((c) => {
          if (c.uniqueId !== courseId) return c;
          if (c.source === 'custom') return null;
          return { ...c, isDeleted: !c.isDeleted };
        })
        .filter((c): c is Course => c !== null);

      const deletedTranscriptCourses = updated
        .filter((c) => c.isDeleted && c.source === 'transcript')
        .map((c) => `${c.courseCode}-${c.courseName}-${c.schoolYear}`);
      changeUserData('deletedTranscriptCourses', deletedTranscriptCourses);
      persistCustomCourses(updated);
      return updated;
    });
  };

  const getCurrentGPA = () => {
    if (gpaType === 'unweighted' && unweightedTranscriptGPA !== null) return unweightedTranscriptGPA;
    if ((gpaType === 'katyWeighted' || gpaType === 'cyFairWeighted') && transcriptGPA !== null) {
      return transcriptGPA;
    }
    return calculateGPA(
      courses.filter((c) => !c.isDeleted),
      true
    );
  };

  const getPredictedGPA = () => calculateGPA(courses, true);

  const currentGPA = getCurrentGPA();
  const predictedGPA = getPredictedGPA();
  const gpaDiff = predictedGPA - currentGPA;
  const displayCourses = React.useMemo(
    () =>
      courses
        .filter((c) => c.source === 'custom' || c.source === 'transcript')
        .sort((a, b) => {
          if (a.source === 'custom' && b.source !== 'custom') return -1;
          if (a.source !== 'custom' && b.source === 'custom') return 1;
          const yearA = parseInt(a.year || '0') || 0;
          const yearB = parseInt(b.year || '0') || 0;
          if (yearA !== yearB) return yearB - yearA;
          return a.courseName.localeCompare(b.courseName);
        }),
    [courses]
  );
  const nonDeletedCourses = displayCourses.filter((c) => !c.isDeleted);
  const allCoursesHaveTypes =
    gpaType === 'unweighted'
      ? nonDeletedCourses.length > 0
      : nonDeletedCourses.length > 0 && nonDeletedCourses.every((c) => c.type);

  const weightedButtonLabel =
    defaultGpaType === 'cyFairWeighted' ? 'Weighted - Cy-Fair ISD' : 'Weighted - Katy ISD';
  const isWeightedSelected = gpaType === 'katyWeighted' || gpaType === 'cyFairWeighted';
  const courseTypeOptions = getCourseTypes();

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="GPA Calculator" />

      {loading && (
        <View className="flex-1 items-center justify-center gap-3">
          <Spinner size="large" />
          <Text className="text-muted-foreground">Loading transcript...</Text>
        </View>
      )}

      {!loading && (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          className="flex-1">
          <View className="flex-row gap-3">
            <StatCard
              label="Current GPA"
              value={currentGPA.toFixed(4)}
              colorClass="border-blue-300 bg-blue-100 dark:border-blue-700 dark:bg-blue-950"
            />
            {allCoursesHaveTypes ? (
              <StatCard
                label="Predicted GPA"
                value={predictedGPA.toFixed(4)}
                colorClass="border-purple-300 bg-purple-100 dark:border-purple-700 dark:bg-purple-950">
                <DiffChip value={gpaDiff} precision={4} />
              </StatCard>
            ) : (
              <View className="flex-1 items-center justify-center rounded-lg border border-border bg-muted p-3">
                <Text className="text-center text-xs text-muted-foreground">
                  Select a type for every course to see the predicted GPA
                </Text>
              </View>
            )}
          </View>

          <View className="flex-row gap-2">
            <Button
              variant={isWeightedSelected ? 'default' : 'outline'}
              className="flex-1"
              onPress={() => setGpaType(defaultGpaType)}>
              <Text numberOfLines={1}>{weightedButtonLabel}</Text>
            </Button>
            <Button
              variant={gpaType === 'unweighted' ? 'default' : 'outline'}
              className="flex-1"
              onPress={() => setGpaType('unweighted')}>
              <Text>Unweighted</Text>
            </Button>
          </View>

          {displayCourses.length === 0 && (
            <Text className="py-2 text-muted-foreground">No transcript courses found.</Text>
          )}

          {displayCourses.length > 0 && (
            <View className="gap-2">
              <Button variant="outline" onPress={addCustomCourse}>
                <Icon as={Plus} className="size-4" />
                <Text>Add Course</Text>
              </Button>
              
              {displayCourses.map((course) => {
                const courseGPA = calculateCourseGPA(course.grade, course.type);
                return (
                  <View
                    key={course.uniqueId}
                    className="flex-row items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5"
                    style={course.isDeleted ? { opacity: 0.55 } : undefined}>
                    {gpaType === 'unweighted' ? (
                      <View style={{ width: 64 }} className="items-center">
                        <Text className="text-xs text-muted-foreground">—</Text>
                      </View>
                    ) : (
                      <View style={{ width: 72 }}>
                        <Select
                          value={course.type ? { value: course.type, label: course.type } : undefined}
                          onValueChange={(option) =>
                            option && updateCourse(course.uniqueId, 'type', option.value)
                          }
                          disabled={course.isDeleted}>
                          <SelectTrigger>
                            <SelectValue placeholder="—" className="text-xs text-foreground" />
                          </SelectTrigger>
                          <SelectContent>
                            {courseTypeOptions.map((type) => (
                              <SelectItem key={type} value={type} label={type} />
                            ))}
                          </SelectContent>
                        </Select>
                      </View>
                    )}

                    {course.source === 'custom' ? (
                      <Input
                        value={course.courseName}
                        onChangeText={(v) => updateCourse(course.uniqueId, 'courseName', v)}
                        placeholder="Course Name"
                        className="h-10 flex-1"
                      />
                    ) : (
                      <Text className="flex-1 text-sm font-medium ml-1" numberOfLines={1}>
                        {course.courseName}
                      </Text>
                    )}

                    {course.source === 'custom' ? (
                      <Input
                        value={String(course.grade)}
                        onChangeText={(v) => updateCourse(course.uniqueId, 'grade', v)}
                        placeholder="95"
                        keyboardType="number-pad"
                        className="h-10 w-14"
                      />
                    ) : (
                      <Text className="w-14 text-left text-sm font-medium pl-1">{course.grade}</Text>
                    )}

                    <Text className="w-7 text-right text-xs text-muted-foreground">
                      {courseGPA?.toFixed(2) ?? '—'}
                    </Text>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onPress={() => toggleDeleteCourse(course.uniqueId)}>
                      {course.isDeleted && course.source === 'transcript' ? (
                        <Icon as={RotateCcw} className="size-4 text-green-600" />
                      ) : (
                        <Icon as={Trash2} className="size-4 text-destructive" />
                      )}
                    </Button>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
