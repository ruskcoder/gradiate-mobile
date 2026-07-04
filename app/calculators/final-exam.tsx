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
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { getClasses } from '@/lib/grades-api';
import { getInitialTerm, getLatestGradesLoad, getTermList, hasStorageData } from '@/lib/grades-store';
import { X } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ClassInfo {
  course: string;
  name: string;
  average?: number | string;
}

export default function FinalExamCalculatorScreen() {
  const insets = useSafeAreaInsets();

  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [termList, setTermList] = React.useState<string[]>([]);
  const [classes, setClasses] = React.useState<ClassInfo[]>([]);
  const [selectedClass, setSelectedClass] = React.useState('');
  const [selectedTerms, setSelectedTerms] = React.useState<Set<string>>(new Set());
  const [loadingTerms, setLoadingTerms] = React.useState<Record<string, boolean>>({});
  const [cachedTermData, setCachedTermData] = React.useState<Record<string, ClassInfo[]>>({});

  const [finalExamWeight, setFinalExamWeight] = React.useState('15');
  const [termAverages, setTermAverages] = React.useState<Record<string, string>>({});
  const [calculatorTermAverages, setCalculatorTermAverages] = React.useState<Record<string, string>>({});
  const [finalExamGrade, setFinalExamGrade] = React.useState('');
  const [desiredAverage, setDesiredAverage] = React.useState('');
  const [calculateError, setCalculateError] = React.useState('');
  const [isExempting, setIsExempting] = React.useState(false);

  const loadedFromStorageRef = React.useRef(false);

  React.useEffect(() => {
    (async () => {
      try {
        setLoadingInitial(true);
        for await (const chunk of getClasses()) {
          if (chunk.percent !== undefined && chunk.message !== undefined) continue;
          if (chunk.success === true) {
            if (loadedFromStorageRef.current) return;

            setTermList(chunk.termList);
            setClasses(chunk.classes);
            setCachedTermData((prev) => ({ ...prev, [chunk.term]: chunk.classes }));

            if (chunk.classes.length > 0 && !selectedClass) {
              setSelectedClass(chunk.classes[0].course);
            }
            setSelectedTerms(new Set([chunk.term]));

            const firstClassData = chunk.classes[0];
            if (firstClassData?.average !== undefined && firstClassData.average !== '') {
              const avg = parseFloat(String(firstClassData.average));
              setTermAverages({ [chunk.term]: avg.toFixed(2) });
              setCalculatorTermAverages({ [chunk.term]: avg.toFixed(2) });
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch initial data for final exam calculator', e);
      } finally {
        setLoadingInitial(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFetchData = async () => {
    if (!selectedClass) {
      setCalculateError('Please select a class first');
      return;
    }

    const termsToFetch: string[] = [];
    const termsFromStorage: string[] = [];

    for (const term of selectedTerms) {
      if (cachedTermData[term]?.length) {
        continue;
      }
      if (hasStorageData(term)) {
        termsFromStorage.push(term);
      } else {
        termsToFetch.push(term);
      }
    }

    if (termsToFetch.length === 0 && termsFromStorage.length === 0) {
      setCalculateError('All selected terms already loaded');
      return;
    }
    setCalculateError('');

    for (const term of termsFromStorage) {
      const latestLoad = getLatestGradesLoad(term);
      if (!latestLoad) continue;
      setCachedTermData((prev) => ({ ...prev, [term]: latestLoad.classes }));
      const selectedClassData = latestLoad.classes.find((c: ClassInfo) => c.course === selectedClass);
      if (selectedClassData?.average !== undefined && selectedClassData.average !== '') {
        const avg = parseFloat(String(selectedClassData.average));
        setTermAverages((prev) => ({ ...prev, [term]: avg.toFixed(2) }));
        setCalculatorTermAverages((prev) => ({ ...prev, [term]: avg.toFixed(2) }));
      } else {
        setTermAverages((prev) => ({ ...prev, [term]: '' }));
        setCalculatorTermAverages((prev) => ({ ...prev, [term]: '' }));
      }
    }

    for (const term of termsToFetch) {
      try {
        setLoadingTerms((prev) => ({ ...prev, [term]: true }));
        for await (const chunk of getClasses(term)) {
          if (chunk.percent !== undefined && chunk.message !== undefined) continue;
          if (chunk.success === true) {
            setCachedTermData((prev) => ({ ...prev, [term]: chunk.classes }));
            const selectedClassData = chunk.classes.find((c: ClassInfo) => c.course === selectedClass);
            if (selectedClassData?.average !== undefined && selectedClassData.average !== '') {
              const avg = parseFloat(String(selectedClassData.average));
              setTermAverages((prev) => ({ ...prev, [term]: avg.toFixed(2) }));
              setCalculatorTermAverages((prev) => ({ ...prev, [term]: avg.toFixed(2) }));
            } else {
              setTermAverages((prev) => ({ ...prev, [term]: '' }));
              setCalculatorTermAverages((prev) => ({ ...prev, [term]: '' }));
              setCalculateError(`No grade data for selected class in Term ${term}`);
            }
            setLoadingTerms((prev) => ({ ...prev, [term]: false }));
          }
        }
      } catch (e) {
        console.error(`Failed to fetch term ${term}`, e);
        setCalculateError(`Failed to load data for Term ${term}`);
        setLoadingTerms((prev) => ({ ...prev, [term]: false }));
      }
    }
  };

  const handleUseStoredInitial = () => {
    const storedInitialTerm = getInitialTerm();
    const storedTermList = getTermList();
    const latestLoad = getLatestGradesLoad(storedInitialTerm);
    if (latestLoad && storedTermList.length > 0) {
      loadedFromStorageRef.current = true;
      setTermList(storedTermList);
      setClasses(latestLoad.classes);
      setCachedTermData((prev) => ({ ...prev, [storedInitialTerm]: latestLoad.classes }));
      setSelectedTerms(new Set([storedInitialTerm]));

      if (latestLoad.classes.length > 0) {
        setSelectedClass(latestLoad.classes[0].course);
        const firstClassData = latestLoad.classes[0];
        if (firstClassData?.average !== undefined && firstClassData.average !== '') {
          const avg = parseFloat(String(firstClassData.average));
          setTermAverages({ [storedInitialTerm]: avg.toFixed(2) });
          setCalculatorTermAverages({ [storedInitialTerm]: avg.toFixed(2) });
        }
      }
      setLoadingInitial(false);
    }
  };

  const handleCalculate = () => {
    setCalculateError('');

    const sortedKeys = Object.keys(calculatorTermAverages).sort(
      (a, b) => termList.indexOf(a) - termList.indexOf(b)
    );
    const termAvgValues = sortedKeys.map((key) => {
      const parsed = parseFloat(calculatorTermAverages[key]);
      return isNaN(parsed) ? null : parsed;
    });
    const desired = desiredAverage ? parseFloat(desiredAverage) : null;

    const blankTerms = sortedKeys.filter((_, i) => termAvgValues[i] === null);
    const hasBlankTerms = blankTerms.length > 0;

    if (isExempting) {
      const blankFieldNames: string[] = [];
      let emptyCount = 0;

      if (hasBlankTerms) {
        emptyCount += blankTerms.length;
        blankFieldNames.push(...blankTerms.map((t) => `Term ${t}`));
      }
      if (desired === null) {
        emptyCount++;
        blankFieldNames.push('desired average');
      }
      if (emptyCount === 0) {
        setCalculateError('Please leave one field blank to calculate it');
        return;
      }
      if (emptyCount !== 1) {
        setCalculateError(
          `Exactly one field must be blank (currently ${emptyCount} are blank: ${blankFieldNames.join(', ')})`
        );
        return;
      }

      if (desired === null) {
        const validTermAvgs = termAvgValues.filter((v): v is number => v !== null);
        const avgTerms = validTermAvgs.reduce((a, b) => a + b, 0) / validTermAvgs.length;
        setDesiredAverage(avgTerms.toFixed(2));
      } else {
        const blankIndex = termAvgValues.findIndex((v) => v === null);
        const validTermAvgs = termAvgValues.filter((v): v is number => v !== null);
        const sumValidTerms = validTermAvgs.reduce((a, b) => a + b, 0);
        const calculated = desired * termAvgValues.length - sumValidTerms;
        const termKey = sortedKeys[blankIndex];
        setCalculatorTermAverages((prev) => ({ ...prev, [termKey]: calculated.toFixed(2) }));
      }
      return;
    }

    const weight = parseFloat(finalExamWeight);
    if (isNaN(weight) || weight < 0 || weight >= 100) {
      setCalculateError('Final exam weight must be between 0 and 100');
      return;
    }
    const finalExam = finalExamGrade ? parseFloat(finalExamGrade) : null;

    const blankFieldNames: string[] = [];
    let emptyCount = 0;

    if (hasBlankTerms) {
      emptyCount += blankTerms.length;
      blankFieldNames.push(...blankTerms.map((t) => `Term ${t}`));
    }
    if (finalExam === null) {
      emptyCount++;
      blankFieldNames.push('final exam grade');
    }
    if (desired === null) {
      emptyCount++;
      blankFieldNames.push('desired average');
    }
    if (emptyCount === 0) {
      setCalculateError('Please leave one field blank to calculate it');
      return;
    }
    if (emptyCount !== 1) {
      setCalculateError(
        `Exactly one field must be blank (currently ${emptyCount} are blank: ${blankFieldNames.join(', ')})`
      );
      return;
    }

    const totalWeight = 100 - weight;

    if (desired === null) {
      const validTermAvgs = termAvgValues.filter((v): v is number => v !== null);
      const avgTerms = validTermAvgs.reduce((a, b) => a + b, 0) / validTermAvgs.length;
      const calculated = (avgTerms * totalWeight + finalExam! * weight) / 100;
      setDesiredAverage(calculated.toFixed(2));
    } else if (finalExam === null) {
      const validTermAvgs = termAvgValues.filter((v): v is number => v !== null);
      const avgTerms = validTermAvgs.reduce((a, b) => a + b, 0) / validTermAvgs.length;
      const calculated = (desired * 100 - avgTerms * totalWeight) / weight;
      setFinalExamGrade(calculated.toFixed(2));
    } else {
      const blankIndex = termAvgValues.findIndex((v) => v === null);
      const validTermAvgs = termAvgValues.filter((v): v is number => v !== null);
      const sumValidTerms = validTermAvgs.reduce((a, b) => a + b, 0);
      const calculated =
        ((desired * 100 - finalExam * weight) * termAvgValues.length) / totalWeight - sumValidTerms;
      const termKey = sortedKeys[blankIndex];
      setCalculatorTermAverages((prev) => ({ ...prev, [termKey]: calculated.toFixed(2) }));
    }
  };

  const sortedTermKeys = React.useMemo(
    () => Array.from(selectedTerms).sort((a, b) => termList.indexOf(a) - termList.indexOf(b)),
    [selectedTerms, termList]
  );
  const hasInitialStorageData = React.useMemo(() => {
    const initialTerm = getInitialTerm();
    return initialTerm !== '' && hasStorageData(initialTerm);
  }, []);
  const exemptingAverage = React.useMemo(() => {
    const validAverages = Object.values(termAverages)
      .map((v) => parseFloat(v))
      .filter((v) => !isNaN(v));
    if (validAverages.length === 0) return null;
    return (validAverages.reduce((a, b) => a + b, 0) / validAverages.length).toFixed(2);
  }, [termAverages]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Final Exam Calculator" />

      {loadingInitial && (
        <View className="flex-1 items-center justify-center gap-3">
          <Spinner size="large" />
          {hasInitialStorageData && (
            <Button variant="outline" size="sm" onPress={handleUseStoredInitial}>
              <Text>Use Stored</Text>
            </Button>
          )}
        </View>
      )}

      {!loadingInitial && (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 20 }}
          className="flex-1">
          {/* Data section */}
          <View className="gap-3">
            <Text className="text-lg font-semibold">Data</Text>

            <View className="gap-1.5">
              <Text className="text-sm font-medium">Class</Text>
              <Select
                value={selectedClass ? { value: selectedClass, label: selectedClass } : undefined}
                onValueChange={(option) => {
                  if (!option) return;
                  setSelectedClass(option.value);
                  selectedTerms.forEach((term) => {
                    const data = cachedTermData[term];
                    if (!data) return;
                    const classData = data.find((c) => c.course === option.value);
                    if (classData?.average !== undefined && classData.average !== '') {
                      const avg = parseFloat(String(classData.average));
                      setTermAverages((prev) => ({ ...prev, [term]: avg.toFixed(2) }));
                      setCalculatorTermAverages((prev) => ({ ...prev, [term]: avg.toFixed(2) }));
                    }
                  });
                }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a class" className="text-sm text-foreground" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.course} value={cls.course} label={cls.name || cls.course} />
                  ))}
                </SelectContent>
              </Select>
            </View>

            <View className="gap-1.5">
              <Text className="text-sm font-medium">Terms</Text>
              <View
                className="flex-row flex-wrap gap-2"
                onStartShouldSetResponder={() => true}>
                {termList.map((term) => (
                  <Toggle
                    key={term}
                    pressed={selectedTerms.has(term)}
                    onPressedChange={(pressed) => {
                      setSelectedTerms((prev) => {
                        const next = new Set(prev);
                        if (pressed) next.add(term);
                        else next.delete(term);
                        return next;
                      });
                    }}
                    variant="outline">
                    <Text>Term {term}</Text>
                  </Toggle>
                ))}
              </View>
            </View>

            <Button onPress={handleFetchData}>
              <Text>Fetch Data</Text>
            </Button>

            <View className="gap-1.5 border-t border-border pt-3">
              <Text className="text-sm font-medium">Grade</Text>
              {sortedTermKeys.map((term) => (
                <View key={term} className="flex-row items-center gap-2">
                  <Text className="text-sm">Term {term}:</Text>
                  {loadingTerms[term] ? (
                    <Spinner size="small" />
                  ) : (
                    <Text className="text-sm font-medium">{termAverages[term] || '--'}</Text>
                  )}
                </View>
              ))}
              {selectedTerms.size === 0 && (
                <Text className="text-sm text-muted-foreground">Select terms to load</Text>
              )}
            </View>

            <View className="gap-1 border-t border-border pt-3">
              <Text className="text-sm font-medium">Average if exempting</Text>
              <Text className="text-sm font-bold">{exemptingAverage || '--'}</Text>
            </View>
          </View>

          {/* Calculate section */}
          <View className="gap-3 border-t border-border pt-4">
            <Text className="text-lg font-semibold">Calculate</Text>

            <View className="gap-2">
              <Text className="text-base font-semibold">Term Averages</Text>
              <View className="flex-row flex-wrap gap-2">
                {sortedTermKeys.map((term) => (
                  <View key={term} className="gap-1" style={{ width: 90 }}>
                    <Text className="text-sm text-muted-foreground">Term {term}</Text>
                    <Input
                      value={calculatorTermAverages[term] || ''}
                      onChangeText={(v) =>
                        setCalculatorTermAverages((prev) => ({ ...prev, [term]: v }))
                      }
                      placeholder={termAverages[term] || '--'}
                      keyboardType="decimal-pad"
                      className="h-9"
                    />
                  </View>
                ))}
              </View>
            </View>

            <View className="flex-row items-center justify-between border-t border-border pt-3">
              <Text className="font-medium">Exempting</Text>
              <Switch checked={isExempting} onCheckedChange={setIsExempting} />
            </View>

            <View className="gap-1.5">
              <Text className="text-sm font-medium">Final Exam Grade</Text>
              <View className="relative flex-row items-center h-9">
                <Input
                  value={finalExamGrade}
                  onChangeText={setFinalExamGrade}
                  placeholder="Final exam grade"
                  keyboardType="decimal-pad"
                  editable={!isExempting}
                  className="h-9 flex-1 pr-9"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-0 h-9 w-9"
                  onPress={() => setFinalExamGrade('')}>
                  <Icon as={X} className="size-4 text-muted-foreground" />
                </Button>
              </View>
            </View>

            <View className="gap-1.5">
              <Text className="text-sm font-medium">Weight (%)</Text>
              <Input
                value={finalExamWeight}
                onChangeText={setFinalExamWeight}
                placeholder="20"
                keyboardType="decimal-pad"
                editable={!isExempting}
                className="h-9"
              />
            </View>

            <View className="gap-1.5 border-t border-border pt-3">
              <Text className="text-sm font-medium">Semester Average</Text>
              <View className="flex-row items-center gap-2">
                <View className="relative flex-1 h-9">
                  <Input
                    value={desiredAverage}
                    onChangeText={setDesiredAverage}
                    placeholder="Semester average"
                    keyboardType="decimal-pad"
                    className="h-9 pr-9"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-0 h-9 w-9"
                    onPress={() => setDesiredAverage('')}>
                    <Icon as={X} className="size-4 text-muted-foreground" />
                  </Button>
                </View>
                <Button variant="outline" size="sm" onPress={() => setDesiredAverage('89.5')}>
                  <Text>A</Text>
                </Button>
                <Button variant="outline" size="sm" onPress={() => setDesiredAverage('79.5')}>
                  <Text>B</Text>
                </Button>
              </View>
            </View>

            {!!calculateError && (
              <Text className="text-sm font-medium text-destructive">{calculateError}</Text>
            )}

            <Button size="lg" onPress={handleCalculate}>
              <Text>Calculate</Text>
            </Button>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
