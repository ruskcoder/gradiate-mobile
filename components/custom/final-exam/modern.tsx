import { GradePillInput } from '@/components/custom/grade-pill-input';
import { gradeAndColor } from '@/components/custom/grades-item';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppSettings } from '@/lib/app-settings';
import { usePrimaryColor } from '@/lib/use-primary-color';
import {
  LETTER_TARGETS,
  buildSemesters,
  fmt,
  isAllInOne,
  mergeClassAverages,
  parseGrade,
  semesterFor,
  solve,
  termLabel,
  type AveragesByTerm,
  type Semester,
  type Unknown,
} from '@/lib/final-exam-math';
import { getClasses } from '@/lib/grades-api';
import { getInitialTerm, getLatestGradesLoad, getTermList, getTermTree } from '@/lib/grades-store';
import { useCurrentUser, useStore } from '@/lib/store';
import { flatForest, pathToLabel, type TermNode } from '@/lib/term-tree';
import { cn } from '@/lib/utils';
import { ArrowRight, Calculator, RotateCcw } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ClassInfo {
  course: string;
  name: string;
  average?: number | string;
  averages?: Record<string, unknown>;
}

// Shown before any grade data exists, so the calculator still works by hand.
const MANUAL_SEMESTER: Semester = { id: 'MANUAL', label: 'Semester', terms: ['1', '2'] };

const RED = '#ef4444';
const GREEN = '#22c55e';
const BLUE = '#3b82f6';
const YELLOW = '#eab308';

/** `#rrggbb` scaled toward black — the border of a selected goal button. */
function darken(hex: string, factor = 0.55): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'rgba(0,0,0,0.45)';
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * factor);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Every label in a term forest, roots included. */
function allLabels(forest: TermNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: TermNode[]) =>
    nodes.forEach((n) => {
      out.push(n.label);
      walk(n.children || []);
    });
  walk(forest || []);
  return out;
}

/** Saved grades, so the calculator fills in instantly before the live load. */
function readStored() {
  const initial = getInitialTerm();
  const storedList = getTermList();
  if (!initial || !storedList.length) return null;
  const tree = getTermTree() as TermNode[];
  const forest = tree?.length ? tree : flatForest(storedList);
  const path = pathToLabel(forest, initial);
  let byTerm: AveragesByTerm = {};
  new Set([...storedList, ...allLabels(tree)]).forEach((label) => {
    const load = getLatestGradesLoad(label);
    if (load) byTerm = mergeClassAverages(byTerm, label, load.classes);
  });
  return {
    forest,
    termList: storedList,
    path: path.length ? path : [initial],
    byTerm,
    classes: (getLatestGradesLoad(initial)?.classes || []) as ClassInfo[],
  };
}

export function FinalExamModern({ header }: { header: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);
  const { hideColors } = useAppSettings();
  const primaryColor = usePrimaryColor();

  // ── Grade data ──────────────────────────────────────────────────────────
  const [stored] = React.useState(readStored);
  const [forest, setForest] = React.useState<TermNode[]>(stored?.forest ?? []);
  const [termList, setTermList] = React.useState<string[]>(stored?.termList ?? []);
  const [currentPath, setCurrentPath] = React.useState<string[]>(stored?.path ?? []);
  const [classes, setClasses] = React.useState<ClassInfo[]>(stored?.classes ?? []);
  const [byTerm, setByTerm] = React.useState<AveragesByTerm>(stored?.byTerm ?? {});
  const [liveTerms, setLiveTerms] = React.useState<Set<string>>(() => new Set());
  const [loadingTerms, setLoadingTerms] = React.useState<Record<string, boolean>>({});
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [allInOne, setAllInOne] = React.useState(false);
  const attemptedRef = React.useRef(new Set<string>());
  const mountedRef = React.useRef(true);
  React.useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  // ── Calculator inputs ───────────────────────────────────────────────────
  const [pickedCourse, setCourse] = React.useState('');
  const [semesterId, setSemesterId] = React.useState<string | null>(null);
  // Edits and left-out terms are kept per class + semester, so switching class
  // shows that class's real grades and switching back restores your edits.
  const [excludedBy, setExcludedBy] = React.useState<Record<string, string[]>>({});
  const [overridesBy, setOverridesBy] = React.useState<Record<string, Record<string, string>>>({});
  const [finalInput, setFinalInput] = React.useState('');
  const [targetInput, setTargetInput] = React.useState('');
  const [lastTouched, setLastTouched] = React.useState<'final' | 'target'>('final');
  const [exempt, setExempt] = React.useState(false);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [weightInput, setWeightInput] = React.useState(String(user?.finalExamWeight ?? 15));

  const applyMeta = React.useCallback((tree: TermNode[] | undefined, list: string[], term: string) => {
    const f = tree?.length ? tree : flatForest(list);
    setForest(f);
    setTermList(list || []);
    const path = pathToLabel(f, term);
    setCurrentPath(path.length ? path : [term]);
  }, []);

  // The live load refreshes whatever the saved grades filled in.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        for await (const chunk of getClasses()) {
          if (cancelled) return;
          if (chunk.success !== true) continue;
          applyMeta(chunk.termTree, chunk.termList, chunk.term);
          setClasses(chunk.classes || []);
          setByTerm((prev) => mergeClassAverages(prev, chunk.term, chunk.classes));
          const whole = !!chunk.hasSubterms || isAllInOne(chunk.classes);
          setAllInOne(whole);
          setLiveTerms((prev) => {
            const next = new Set(prev);
            next.add(chunk.term);
            if (whole) Object.keys(chunk.classes?.[0]?.averages || {}).forEach((t) => next.add(t));
            return next;
          });
        }
      } catch (e) {
        console.error('Final exam calculator: initial load failed', e);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyMeta]);

  // The picked class, or the first one until the user picks (or if it vanished).
  const course = classes.some((c) => c.course === pickedCourse) ? pickedCourse : (classes[0]?.course ?? '');

  const semesters = React.useMemo(() => buildSemesters(forest, termList), [forest, termList]);
  const semester = React.useMemo<Semester>(() => {
    if (!semesters.length) return MANUAL_SEMESTER;
    return (
      semesters.find((s) => s.id === semesterId) ?? semesterFor(semesters, currentPath) ?? MANUAL_SEMESTER
    );
  }, [semesters, semesterId, currentPath]);

  // Quietly fetch the semester's other terms in the background. All-in-one
  // portals already sent every term, so there's nothing to fetch for them.
  // Not cancelled when deps change: each finished term updates `liveTerms`,
  // which re-runs this effect, and that must not abandon the rest of the queue.
  React.useEffect(() => {
    if (initialLoading || allInOne || semester.id === MANUAL_SEMESTER.id) return;
    const todo = semester.terms.filter((t) => !liveTerms.has(t) && !attemptedRef.current.has(t));
    if (!todo.length) return;
    todo.forEach((t) => attemptedRef.current.add(t));
    (async () => {
      for (const term of todo) {
        setLoadingTerms((p) => ({ ...p, [term]: true }));
        try {
          for await (const chunk of getClasses(term)) {
            if (!mountedRef.current) return;
            if (chunk.success !== true) continue;
            setByTerm((prev) => mergeClassAverages(prev, term, chunk.classes));
            setLiveTerms((prev) => new Set(prev).add(term));
          }
        } catch (e) {
          console.error(`Final exam calculator: failed to load term ${term}`, e);
        } finally {
          if (mountedRef.current) setLoadingTerms((p) => ({ ...p, [term]: false }));
        }
      }
    })();
  }, [initialLoading, allInOne, semester, liveTerms]);

  const ctxKey = `${course}|${semester.id}`;
  const overrides = overridesBy[ctxKey] ?? {};
  const excluded = new Set(excludedBy[ctxKey] ?? []);
  const setOverrides = (fn: (prev: Record<string, string>) => Record<string, string>) =>
    setOverridesBy((all) => ({ ...all, [ctxKey]: fn(all[ctxKey] ?? {}) }));

  // ── Derived values ──────────────────────────────────────────────────────
  const weight = parseFloat(weightInput);
  const weightValid = Number.isFinite(weight) && weight >= 0 && weight < 100;
  const fetchedRaw = (t: string) => {
    const n = parseGrade(byTerm[t]?.[course]);
    return n === null ? '' : n.toFixed(2);
  };
  const rawTerm = (t: string) => (overrides[t] !== undefined ? overrides[t] : fetchedRaw(t));
  const isLoading = (t: string) =>
    !!loadingTerms[t] || (initialLoading && !fetchedRaw(t) && overrides[t] === undefined);

  const activeTerms = semester.terms.filter((t) => !excluded.has(t));
  const termNums = activeTerms.map((t) => parseGrade(rawTerm(t)));
  const emptyIdx = activeTerms.map((_, i) => (termNums[i] === null ? i : -1)).filter((i) => i >= 0);
  const waitingOn = activeTerms.filter((t, i) => termNums[i] === null && isLoading(t));

  let auto: Unknown;
  if (emptyIdx.length) auto = emptyIdx[0];
  else if (exempt) auto = 'target';
  else auto = lastTouched === 'target' ? 'final' : 'target';

  const finalNum = parseGrade(finalInput);
  const targetNum = parseGrade(targetInput);
  const solveFor = (unknown: Unknown, target: number | null = targetNum) =>
    emptyIdx.length > 1 || waitingOn.length
      ? null
      : solve({
          terms: termNums,
          final: unknown === 'final' ? null : finalNum,
          target: unknown === 'target' ? null : target,
          weight,
          exempt,
          unknown,
        });
  const result = solveFor(auto);

  // A final exam grade you NEED reads the other way round: needing a 95 is
  // bad news (red), needing a 60 is easy (green).
  const neededColor = (value: string) => {
    const n = parseGrade(value);
    if (n === null || hideColors) return gradeAndColor(value, null, hideColors).bgColor;
    if (n >= 90) return RED;
    if (n >= 80) return YELLOW;
    if (n >= 70) return BLUE;
    return GREEN;
  };

  // Terms allow a little extra credit: anything above 102 is out of reach (red).
  const termColor = (value: string, isAuto: boolean) => {
    const n = parseGrade(value);
    if (n !== null && n > 102 && !hideColors) return RED;
    if (n !== null && n <= 102) return pillColor(String(Math.min(n, 100)), isAuto);
    return pillColor(value, isAuto);
  };

  // The semester average is colored by its rounded value: an 89.5 rounds up to
  // an A, so it shows green.
  const roundedColor = (value: string) => {
    const n = parseGrade(value);
    return pillColor(n === null ? value : String(Math.round(n)), false);
  };

  const pillColor = (value: string, isAuto: boolean) => {
    const n = parseGrade(value);
    if (isAuto && n !== null && !hideColors) {
      if (n > 100) return RED;
      if (n < 0) return GREEN;
    }
    return gradeAndColor(value, null, hideColors).bgColor;
  };

  // ── Field handlers ──────────────────────────────────────────────────────
  const focusAuto = (field: 'final' | 'target') => {
    setFocused(field);
    // Typing over a calculated value starts from blank, with the answer left
    // behind as the placeholder.
    if (field === 'final' && auto === 'final') setFinalInput('');
    if (field === 'target' && auto === 'target') setTargetInput('');
  };

  const setWeight = (v: string) => {
    if (v !== '' && !/^\d{0,2}(\.\d{0,2})?$/.test(v)) return;
    setWeightInput(v);
    const n = parseFloat(v);
    if (Number.isFinite(n) && n >= 0 && n < 100) changeUserData('finalExamWeight', n);
  };

  // "Calculate This": make `field` ('final' | 'target' | a term) the one being
  // solved. Every value on screen is locked in first (including the current
  // answer), so exactly one field ends up blank.
  const calculateThis = (field: string) => {
    const autoTermKey = typeof auto === 'number' ? activeTerms[auto] : null;
    const answer = fmt(result);
    const shownFinal = auto === 'final' ? answer : finalInput;
    const shownTarget = auto === 'target' ? answer : targetInput;
    setOverrides((p) => {
      const next = { ...p };
      if (autoTermKey && autoTermKey !== field) {
        if (answer) next[autoTermKey] = answer;
        else delete next[autoTermKey];
      }
      if (field !== 'final' && field !== 'target') next[field] = '';
      return next;
    });
    setFinalInput(field === 'final' ? '' : shownFinal);
    setTargetInput(field === 'target' ? '' : shownTarget);
    if (field === 'final') setLastTouched('target');
    if (field === 'target') setLastTouched('final');
  };

  const calcButton = (field: string, active: boolean, small = false) => (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: '100%', top: 0, bottom: 0, marginLeft: small ? 4 : 8, justifyContent: 'center' }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Calculate This"
      hitSlop={8}
      onPress={() => calculateThis(field)}
      className={cn(
        'items-center justify-center rounded-md border bg-background active:bg-accent',
        small ? 'size-5' : 'size-8',
        active ? 'border-primary' : 'border-border'
      )}>
      <Icon
        as={Calculator}
        className={cn(small ? 'size-3' : 'size-4', active ? 'text-primary' : 'text-muted-foreground')}
      />
    </Pressable>
    </View>
  );

  const pickTarget = (target: number) => {
    setTargetInput(String(target));
    setLastTouched('target');
  };

  const toggleTerm = (t: string) =>
    setExcludedBy((all) => {
      const next = new Set(all[ctxKey] ?? []);
      if (next.has(t)) next.delete(t);
      else if (semester.terms.length - next.size > 1) next.add(t);
      return { ...all, [ctxKey]: [...next] };
    });

  const displayFinal = auto === 'final' && focused !== 'final' ? fmt(result) : finalInput;
  const displayTarget = auto === 'target' && focused !== 'target' ? fmt(result) : targetInput;


  const classesLoading = initialLoading && !classes.length;
  const chipTerm = currentPath[currentPath.length - 1];

  // Mean of the terms shown, for the "→ average" pill after them.
  const shownTermNums = activeTerms.map((_, i) => (i === auto ? parseGrade(fmt(result)) : termNums[i]));
  const termsMean =
    shownTermNums.length && shownTermNums.every((v) => v !== null)
      ? (shownTermNums as number[]).reduce((a, b) => a + b, 0) / shownTermNums.length
      : null;
  const meanColor = gradeAndColor(fmt(termsMean), null, hideColors).bgColor;

  return (
    <View className="flex-1 bg-background">
      {header}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 24, gap: 24 }}
        className="flex-1">
        {/* Class picker: each chip carries its current average */}
        {(classesLoading || classes.length > 0) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {classesLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <View key={i} className="h-10 w-32 rounded-lg border border-border" />
                ))
              : classes.map((c) => {
                  const avg = (byTerm[chipTerm]?.[c.course] ?? c.average) as string | number | undefined;
                  const { grade, bgColor } = gradeAndColor(avg, null, hideColors);
                  const selected = c.course === course;
                  return (
                    <Pressable
                      key={c.course}
                      onPress={() => setCourse(c.course)}
                      className={cn(
                        'flex-row items-center gap-2 rounded-lg border py-1.5 pl-3 pr-1.5 active:bg-accent',
                        selected ? 'border-primary' : 'border-border'
                      )}>
                      <Text className="max-w-[150px] text-sm font-medium" numberOfLines={1}>
                        {c.name || c.course}
                      </Text>
                      <View
                        className={cn('rounded-sm px-1.5 py-0.5', bgColor.startsWith('var') && 'bg-primary')}
                        style={bgColor.startsWith('var') ? undefined : { backgroundColor: bgColor }}>
                        <Text className="text-xs font-semibold text-white">{grade}</Text>
                      </View>
                    </Pressable>
                  );
                })}
          </ScrollView>
        )}

        <View className="gap-6 px-4">
          {semesters.length > 1 && (
            <Tabs value={semester.id} onValueChange={setSemesterId}>
              <TabsList className="w-full">
                {semesters.map((s) => (
                  <TabsTrigger key={s.id} value={s.id} className="flex-1">
                    <Text>{s.label}</Text>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* Term pills, then their average */}
          <View className="flex-row flex-wrap items-end justify-center gap-x-3 gap-y-4">
            {semester.terms.map((t) => {
              const off = excluded.has(t);
              const idx = activeTerms.indexOf(t);
              const isAuto = !off && idx === auto;
              const value = isAuto && focused !== t ? fmt(result) : rawTerm(t);
              const edited =
                overrides[t] !== undefined && overrides[t] !== fetchedRaw(t) && fetchedRaw(t) !== '';
              return (
                <View key={t} className={cn('items-center gap-1.5', off && 'opacity-40')}>
                  <View className="h-5 flex-row items-center gap-1">
                    <Pressable onPress={() => toggleTerm(t)} hitSlop={6}>
                      <Text className={cn('text-xs font-medium text-muted-foreground', off && 'line-through')}>
                        {termLabel(t)}
                      </Text>
                    </Pressable>
                    {!off && calcButton(t, isAuto, true)}
                    {edited && (
                      <Pressable
                        hitSlop={8}
                        onPress={() =>
                          setOverrides((p) => {
                            const rest = { ...p };
                            delete rest[t];
                            return rest;
                          })
                        }>
                        <Icon as={RotateCcw} className="size-3 text-muted-foreground" />
                      </Pressable>
                    )}
                  </View>
                  <GradePillInput
                    accessibilityLabel={termLabel(t)}
                    value={value}
                    editable={!off}
                    loading={isLoading(t)}
                    computed={isAuto}
                    placeholder={isAuto && focused === t ? fmt(result) || '···' : '···'}
                    color={termColor(value || (isAuto ? fmt(result) : ''), isAuto)}
                    onFocus={() => setFocused(t)}
                    onBlur={() => setFocused(null)}
                    onChange={(v) => setOverrides((p) => ({ ...p, [t]: v }))}
                  />
                </View>
              );
            })}

            <View className="h-10 justify-center">
              <Icon as={ArrowRight} className="size-5 text-muted-foreground" />
            </View>

            <View className="items-center gap-1.5">
              <View className="h-5 justify-center">
                <Text className="text-xs font-medium text-muted-foreground">Average</Text>
              </View>
              <View
                className={cn('h-10 w-[92px] items-center justify-center rounded-md', meanColor.startsWith('var') && 'bg-primary')}
                style={meanColor.startsWith('var') ? undefined : { backgroundColor: meanColor }}>
                <Text className="text-[21px] font-semibold text-white">{fmt(termsMean) || '···'}</Text>
              </View>
            </View>
          </View>

          {/* Calculate */}
          <View className="gap-6">
            <Pressable onPress={() => setExempt((v) => !v)} className="flex-row items-center justify-between">
              <Text className="font-medium">Exempting</Text>
              <Switch checked={exempt} onCheckedChange={setExempt} />
            </Pressable>

            {!exempt && (
              <View className="items-center gap-1.5">
                <View className="h-5 flex-row items-center gap-1">
                  <Text className="text-xs font-medium text-muted-foreground">Final</Text>
                  <TextInput
                    accessibilityLabel="Final exam weight"
                    value={weightInput}
                    onChangeText={(v) => setWeight(v.trim())}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    textAlign="center"
                    className={cn(
                      'h-5 w-8 rounded border p-0 text-xs text-foreground',
                      weightValid ? 'border-border' : 'border-destructive text-destructive'
                    )}
                  />
                  <Text className="text-xs font-medium text-muted-foreground">% weight</Text>
                  {auto === 'final' && <Text className="text-xs font-medium text-primary">· calc</Text>}
                </View>
                <View>
                  <GradePillInput
                    accessibilityLabel="Final exam grade"
                    value={displayFinal}
                    computed={auto === 'final'}
                    placeholder={auto === 'final' && focused === 'final' ? fmt(result) || '···' : '···'}
                    color={
                    auto === 'final'
                      ? neededColor(displayFinal || fmt(result))
                      : pillColor(displayFinal, false)
                  }
                    onFocus={() => focusAuto('final')}
                    onBlur={() => setFocused(null)}
                    onChange={(v) => {
                      setFinalInput(v);
                      setLastTouched('final');
                    }}
                  />
                  {calcButton('final', auto === 'final')}
                </View>
              </View>
            )}

            {/* Semester average, with A/B/C goal shortcuts (nothing to aim for when exempt) */}
            <View className="items-center gap-2">
              <View className="h-7 flex-row items-center gap-2">
                <Text className="text-sm font-medium text-muted-foreground">Semester Average</Text>
                {!exempt && LETTER_TARGETS.map((l) => {
                  const raw = gradeAndColor(l.color, null, hideColors).bgColor;
                  const letterColor = raw.startsWith('var') ? primaryColor : raw;
                  const active = targetNum === l.target && auto !== 'target';
                  return (
                    <Pressable
                      key={l.letter}
                      onPress={() => pickTarget(l.target)}
                      hitSlop={4}
                      className={cn(
                        'size-7 items-center justify-center rounded-sm border-2'
                      )}
                      style={{
                        backgroundColor: letterColor,
                        borderColor: active ? darken(letterColor) : 'transparent',
                      }}>
                      <Text className="text-sm font-bold text-white">{l.letter}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View>
                <GradePillInput
                  size="lg"
                  accessibilityLabel="Semester average"
                  value={displayTarget}
                  computed={auto === 'target'}
                  placeholder={auto === 'target' && focused === 'target' ? fmt(result) || '···' : '···'}
                  color={roundedColor(displayTarget || (auto === 'target' ? fmt(result) : ''))}
                  onFocus={() => focusAuto('target')}
                  onBlur={() => setFocused(null)}
                  onChange={(v) => {
                    setTargetInput(v);
                    setLastTouched('target');
                  }}
                />
                {calcButton('target', auto === 'target')}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
