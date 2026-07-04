import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AssignmentCard } from '@/components/custom/assignment-card';
import { CategoryCard } from '@/components/custom/category-card';
import { GradeRing } from '@/components/custom/grade-ring';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import type { ClassData } from '@/lib/use-class-data';
import { Plus } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

function recalculateGrades(categories: any, scores: any) {
  const updatedCategories = { ...categories };

  Object.keys(updatedCategories).forEach((categoryName) => {
    const categoryScores = scores.filter((s: any) => {
      if (s.category !== categoryName) return false;
      const scoreVal = parseFloat(s.score);
      const isExemptOrDropped = s.badges && (s.badges.includes('dropped') || s.badges.includes('exempt'));
      return !isNaN(scoreVal) && s.score !== '···' && s.score !== '' && !s.excluded && !isExemptOrDropped;
    });

    let totalWeightedStudentPoints = 0;
    let totalWeightedMaxPoints = 0;

    if (categoryScores.length > 0) {
      categoryScores.forEach((s: any) => {
        const weight = parseFloat(s.weight) || 1;
        const studentPoints = parseFloat(s.score) || 0;
        const maxPoints = parseFloat(s.totalPoints) || 0;

        totalWeightedStudentPoints += studentPoints * weight;
        totalWeightedMaxPoints += maxPoints * weight;
      });
    }

    const percentValue =
      totalWeightedMaxPoints > 0 ? (totalWeightedStudentPoints / totalWeightedMaxPoints) * 100 : 0;

    updatedCategories[categoryName] = {
      ...updatedCategories[categoryName],
      percent: percentValue.toFixed(3),
      studentsPoints: totalWeightedStudentPoints.toFixed(4),
      maximumPoints: totalWeightedMaxPoints.toFixed(2),
    };
  });

  let weightedSum = 0;
  let totalWeight = 0;

  Object.values(updatedCategories).forEach((cat: any) => {
    const hasAssignments = parseFloat(cat.maximumPoints) > 0;
    if (hasAssignments) {
      const weight = parseFloat(cat.categoryWeight) || 1;
      const percent = parseFloat(cat.percent) || 0;
      weightedSum += percent * weight;
      totalWeight += weight;
    }
  });

  const average = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { categories: updatedCategories, average };
}

function chunkCategories(categories: Record<string, any>) {
  const entries = Object.entries(categories);
  const columns: [string, any][][] = [];
  for (let i = 0; i < entries.length; i += 2) columns.push(entries.slice(i, i + 2));
  return columns;
}

// Exempt/dropped assignments have no impact on the grade by default. They're
// modeled as "disabled" (excluded: true) so the What If disable toggle can
// turn that off (making them count) and back on (restoring the badge).
function normalizeExemptDropped(classData: ClassData): ClassData {
  const scores = (classData.scores || []).map((s: any) => {
    const isExemptOrDropped = s.badges?.includes('exempt') || s.badges?.includes('dropped');
    if (!isExemptOrDropped) return s;
    return { ...s, originalBadges: s.originalBadges ?? s.badges, excluded: s.excluded ?? true };
  });
  return { ...classData, scores };
}

export function WhatIfContent({ classData }: { classData: ClassData }) {
  const { width: windowWidth } = useWindowDimensions();
  const columnWidth = (windowWidth - 32 - 12) / 2;

  const [current, setCurrent] = React.useState<ClassData>(() => normalizeExemptDropped(classData));
  const [originalAverage] = React.useState(parseFloat(String(classData.average)) || 0);
  const [activeTab, setActiveTab] = React.useState<'predict' | 'target'>('predict');

  const [manualName, setManualName] = React.useState('');
  const [manualPercentage, setManualPercentage] = React.useState('');
  const [manualCategory, setManualCategory] = React.useState('');
  const [manualWeight, setManualWeight] = React.useState('1');

  const [targetCategory, setTargetCategory] = React.useState('');
  const [targetWeight, setTargetWeight] = React.useState('1');
  const [targetAverage, setTargetAverage] = React.useState('');
  const [targetRequired, setTargetRequired] = React.useState<number | null>(null);

  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [newCategoryWeight, setNewCategoryWeight] = React.useState('');

  // Reset local "what if" state whenever a different course is loaded.
  React.useEffect(() => {
    setCurrent(normalizeExemptDropped(classData));
  }, [classData]);

  React.useEffect(() => {
    if (!targetCategory || !targetAverage || !current?.categories) {
      setTargetRequired(null);
      return;
    }

    const targetAvgVal = parseFloat(targetAverage);
    if (isNaN(targetAvgVal) || targetAvgVal < 0 || targetAvgVal > 100) {
      setTargetRequired(null);
      return;
    }

    const currentCategoryData = current.categories[targetCategory];
    if (!currentCategoryData) {
      setTargetRequired(null);
      return;
    }

    const categoryStates: Record<string, any> = {};
    let totalWeight = 0;

    Object.entries(current.categories || {}).forEach(([catName, catData]: any) => {
      const weight = parseFloat(catData.categoryWeight) || 1;
      const percent = parseFloat(catData.percent) || 0;
      const maxPoints = parseFloat(catData.maximumPoints) || 0;
      const studentPoints = parseFloat(catData.studentsPoints) || 0;

      categoryStates[catName] = { weight, percent, maxPoints, studentPoints };
      totalWeight += weight;
    });

    let otherContribution = 0;
    Object.entries(categoryStates).forEach(([catName, catState]) => {
      if (catName !== targetCategory) {
        otherContribution += catState.percent * catState.weight;
      }
    });

    const targetCatWeight = categoryStates[targetCategory].weight;
    const requiredTargetCatPercent = (targetAvgVal * totalWeight - otherContribution) / targetCatWeight;

    const currentMaxPoints = categoryStates[targetCategory].maxPoints;
    const currentStudentPoints = categoryStates[targetCategory].studentPoints;

    const targetWtVal = parseFloat(targetWeight) || 1;
    const newAssignmentTotalPoints = 100;
    const newAssignmentScore =
      ((requiredTargetCatPercent / 100) * (currentMaxPoints + newAssignmentTotalPoints * targetWtVal) -
        currentStudentPoints) /
      targetWtVal;
    const newAssignmentPercentage = (newAssignmentScore / newAssignmentTotalPoints) * 100;

    setTargetRequired(newAssignmentPercentage);
  }, [targetCategory, targetAverage, targetWeight, current?.categories]);

  const handleAddManualGrade = () => {
    const percentage = parseFloat(manualPercentage);
    const weight = parseFloat(manualWeight) || 1;

    if (isNaN(percentage) || !manualCategory || !current) {
      return;
    }

    const assignmentName = manualName.trim() || `Untitled ${manualCategory}`;
    const totalPointsValue = 100;
    const scoreValue = (percentage / 100) * totalPointsValue;

    const newScore = {
      name: assignmentName,
      score: scoreValue,
      percentage: percentage,
      category: manualCategory,
      totalPoints: totalPointsValue,
      weight: weight,
      dateDue: new Date().toLocaleDateString(),
      badges: [],
    };

    const updatedScores = [newScore, ...(current.scores || [])];
    const { categories: updatedCategories, average } = recalculateGrades(current.categories || {}, updatedScores);

    setCurrent({ ...current, scores: updatedScores, categories: updatedCategories, average });

    setManualName('');
    setManualPercentage('');
    setManualCategory('');
    setManualWeight('1');
  };

  const handleAddTargetGrade = () => {
    if (!targetCategory || targetRequired === null || !current) {
      return;
    }

    const assignmentName = `Upcoming ${targetCategory}`;
    const targetWtVal = parseFloat(targetWeight) || 1;
    const totalPointsValue = 100;
    const scoreValue = (targetRequired / 100) * totalPointsValue;

    const newScore = {
      name: assignmentName,
      score: scoreValue,
      percentage: targetRequired,
      category: targetCategory,
      totalPoints: totalPointsValue,
      weight: targetWtVal,
      dateDue: new Date().toLocaleDateString(),
      badges: [],
    };

    const updatedScores = [newScore, ...(current.scores || [])];
    const { categories: updatedCategories, average } = recalculateGrades(current.categories || {}, updatedScores);

    setCurrent({ ...current, scores: updatedScores, categories: updatedCategories, average });

    setTargetCategory('');
    setTargetWeight('1');
    setTargetAverage('');
    setTargetRequired(null);
  };

  const handleRemoveGrade = (index: number) => {
    if (!current) return;
    const updatedScores = (current.scores || []).filter((_: any, i: number) => i !== index);
    const { categories: updatedCategories, average } = recalculateGrades(current.categories || {}, updatedScores);
    setCurrent({ ...current, scores: updatedScores, categories: updatedCategories, average });
  };

  const handleToggleExcluded = (index: number) => {
    if (!current) return;
    const updatedScores = (current.scores || []).map((s: any, i: number) => {
      if (i !== index) return s;
      const nextExcluded = !s.excluded;
      // Toggling an exempt/dropped item off removes the badge so it counts
      // normally; toggling it back on restores the original badge.
      if (s.originalBadges) {
        const badges = nextExcluded
          ? s.originalBadges
          : s.originalBadges.filter((b: string) => b !== 'exempt' && b !== 'dropped');
        return { ...s, excluded: nextExcluded, badges };
      }
      return { ...s, excluded: nextExcluded };
    });
    const { categories: updatedCategories, average } = recalculateGrades(current.categories || {}, updatedScores);
    setCurrent({ ...current, scores: updatedScores, categories: updatedCategories, average });
  };

  const handleEditPercentage = (index: number, newPercentage: number | '') => {
    if (!current) return;
    const updatedScores = (current.scores || []).map((s: any, i: number) => {
      if (i !== index) return s;
      if (newPercentage === '') return { ...s, percentage: '', score: '' };
      const totalPoints = parseFloat(s.totalPoints) || 100;
      return { ...s, percentage: newPercentage, score: (newPercentage / 100) * totalPoints };
    });
    const { categories: updatedCategories, average } = recalculateGrades(current.categories || {}, updatedScores);
    setCurrent({ ...current, scores: updatedScores, categories: updatedCategories, average });
  };

  const handleAddCategory = () => {
    const weight = parseFloat(newCategoryWeight);
    if (isNaN(weight) || !current) return;

    const name = newCategoryName.trim() || `Category ${Object.keys(current.categories || {}).length + 1}`;
    const updatedCategories = {
      ...(current.categories || {}),
      [name]: { categoryWeight: weight.toFixed(2), percent: '0.000', studentsPoints: 0, maximumPoints: 0 },
    };

    setCurrent({ ...current, categories: updatedCategories });
    setNewCategoryName('');
    setNewCategoryWeight('');
  };

  const resetAddCategoryFields = () => {
    setNewCategoryName('');
    setNewCategoryWeight('');
  };

  const categoryOptions = Object.keys(current.categories || {});

  return (
    <View className="py-6 gap-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        <View
          style={{ width: columnWidth }}
          className="items-center justify-center rounded-lg border border-border bg-card p-1">
          <GradeRing
            grade={parseFloat(String(current.average || 0)) || 0}
            size={132}
            label="From"
            fromGrade={originalAverage}
          />
        </View>
        {chunkCategories(current.categories ?? {}).map((column, idx) => {
          const isLastColumn = idx === Math.ceil(Object.keys(current.categories ?? {}).length / 2) - 1;
          const hasOddCategories = Object.keys(current.categories ?? {}).length % 2 === 1;
          const showAddButton = isLastColumn && hasOddCategories;

          return (
            <View key={idx} style={{ width: columnWidth }} className="justify-center gap-2">
              {column.map(([name, data]) => (
                <CategoryCard key={name} name={name} data={data} />
              ))}
              {showAddButton && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Pressable className="items-center justify-center rounded-lg border-2 border-dashed border-foreground py-3 active:bg-accent">
                      <Icon as={Plus} className="mb-1 size-6 text-foreground" />
                      <Text className="text-sm font-medium text-foreground">Add</Text>
                    </Pressable>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Add Category</AlertDialogTitle>
                    </AlertDialogHeader>
                    <View className="gap-3">
                      <View>
                        <Text className="mb-1 text-sm text-muted-foreground">Category Name</Text>
                        <Input placeholder="Optional" value={newCategoryName} onChangeText={setNewCategoryName} />
                      </View>
                      <View>
                        <Text className="mb-1 text-sm text-muted-foreground">Category Weight</Text>
                        <Input
                          placeholder="Required"
                          value={newCategoryWeight}
                          onChangeText={setNewCategoryWeight}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                    <AlertDialogFooter>
                      <AlertDialogCancel onPress={resetAddCategoryFields}>
                        <Text>Cancel</Text>
                      </AlertDialogCancel>
                      <AlertDialogAction onPress={handleAddCategory}>
                        <Text>Save</Text>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </View>
          );
        })}
        {Object.keys(current.categories ?? {}).length % 2 === 0 && (
          <View style={{ width: columnWidth }} className="justify-center">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Pressable className="items-center justify-center rounded-lg border-2 border-dashed border-foreground py-3 active:bg-accent">
                  <Icon as={Plus} className="mb-1 size-6 text-foreground" />
                  <Text className="text-sm font-medium text-foreground">Add</Text>
                </Pressable>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Add Category</AlertDialogTitle>
                </AlertDialogHeader>
                <View className="gap-3">
                  <View>
                    <Text className="mb-1 text-sm text-muted-foreground">Category Name</Text>
                    <Input placeholder="Optional" value={newCategoryName} onChangeText={setNewCategoryName} />
                  </View>
                  <View>
                    <Text className="mb-1 text-sm text-muted-foreground">Category Weight</Text>
                    <Input
                      placeholder="Required"
                      value={newCategoryWeight}
                      onChangeText={setNewCategoryWeight}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <AlertDialogFooter>
                  <AlertDialogCancel onPress={resetAddCategoryFields}>
                    <Text>Cancel</Text>
                  </AlertDialogCancel>
                  <AlertDialogAction onPress={handleAddCategory}>
                    <Text>Save</Text>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </View>
        )}
      </ScrollView>

      <View className="rounded-lg border border-border p-2">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'predict' | 'target')}>
          <TabsList className="w-full">
            <TabsTrigger value="predict" className="flex-1">
              <Text>Predict</Text>
            </TabsTrigger>
            <TabsTrigger value="target" className="flex-1">
              <Text>Target</Text>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === 'predict' && (
          <View className="gap-3 p-2">
            <View>
              <Text className="text-sm font-medium mb-1.5">Name</Text>
              <Input placeholder="Assignment name" value={manualName} onChangeText={setManualName} />
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="text-sm font-medium mb-1.5">Percent</Text>
                <Input
                  placeholder="95%"
                  value={manualPercentage}
                  onChangeText={setManualPercentage}
                  keyboardType="decimal-pad"
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium mb-1.5">Weight</Text>
                <Input
                  placeholder="1"
                  value={manualWeight}
                  onChangeText={setManualWeight}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View>
              <Text className="text-sm font-medium mb-1.5">Category</Text>
              <Select
                value={manualCategory ? { value: manualCategory, label: manualCategory } : undefined}
                onValueChange={(option) => option && setManualCategory(option.value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat} value={cat} label={cat} />
                  ))}
                </SelectContent>
              </Select>
            </View>
            <Button onPress={handleAddManualGrade} className="flex-row gap-1.5">
              <Icon as={Plus} className="size-4" />
              <Text>Add</Text>
            </Button>
          </View>
        )}

        {activeTab === 'target' && (
          <View className="gap-3 p-2">
            <View>
              <Text className="text-sm font-medium mb-1.5">Upcoming Category</Text>
              <Select
                value={targetCategory ? { value: targetCategory, label: targetCategory } : undefined}
                onValueChange={(option) => option && setTargetCategory(option.value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat} value={cat} label={cat} />
                  ))}
                </SelectContent>
              </Select>
            </View>
            <View>
              <Text className="text-sm font-medium mb-1.5">Weight</Text>
              <Input
                placeholder="1"
                value={targetWeight}
                onChangeText={setTargetWeight}
                keyboardType="decimal-pad"
              />
            </View>
            <View>
              <Text className="text-sm font-medium mb-1.5">Target Average</Text>
              <View className="flex-row gap-2">
                <Input
                  placeholder="Target %"
                  value={targetAverage}
                  onChangeText={setTargetAverage}
                  keyboardType="decimal-pad"
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onPress={() => setTargetAverage('89.5')}>
                  <Text>A</Text>
                </Button>
                <Button variant="outline" size="sm" onPress={() => setTargetAverage('79.5')}>
                  <Text>B</Text>
                </Button>
              </View>
            </View>

            <View className="rounded-lg bg-muted p-4">
              <Text className="text-sm text-muted-foreground">You need a</Text>
              <Text className="text-3xl font-bold text-primary">
                {targetRequired !== null ? `${targetRequired.toFixed(1)}%` : '----'}
              </Text>
            </View>

            <Button onPress={handleAddTargetGrade} disabled={targetRequired === null} className="flex-row gap-1.5">
              <Icon as={Plus} className="size-4" />
              <Text>Add</Text>
            </Button>
          </View>
        )}
      </View>

      {current.scores && current.scores.length > 0 && (
        <View>
          <Text className="text-lg font-semibold mb-3">Assignments</Text>
          <View className="gap-2">
            {current.scores.map((score: any, idx: number) => (
              <AssignmentCard
                key={idx}
                score={score}
                onRemove={() => handleRemoveGrade(idx)}
                onToggleExcluded={() => handleToggleExcluded(idx)}
                onEditPercentage={(newPercentage) => handleEditPercentage(idx, newPercentage)}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
