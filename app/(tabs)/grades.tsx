import { Button } from '@/components/ui/button';
import { GradesItem } from '@/components/custom/grades-item';
import { ReorderableList } from '@/components/custom/reorderable-list';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { useAppSettings } from '@/lib/app-settings';
import { applyCourseOrder, getCourseOrder, setCourseOrder } from '@/lib/course-order-storage';
import { getClasses } from '@/lib/grades-api';
import { getInitialTerm, getLatestGradesLoad, getTermList, hasStorageData } from '@/lib/grades-store';
import { useCurrentUser, useStore } from '@/lib/store';
import { TOOL_TITLES } from '@/lib/tool-types';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, RefreshCw } from 'lucide-react-native';
import * as React from 'react';
import { BackHandler, InteractionManager, ScrollView, View } from 'react-native';
import Animated, {
  Easing,
  Keyframe,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GRADES_CONTENT_REVEAL_DELAY_MS,
  GRADES_CROSSFADE_MS,
  GRADES_DONE_HOLD_MS,
  GRADES_TERM_SHIFT_MS,
  GRADES_TERM_SHIFT_OFFSET,
  LIST_REVEAL_DURATION_MS,
  GRADES_STANDALONE_CONTENT_REVEAL_DELAY_MS,
} from '@/lib/constants';

interface Course {
  course: string;
  name: string;
  average?: number | string;
  averages?: Record<string, number>;
  categories?: Record<string, any>;
  scores?: any[];
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Mirrors a single grade row's reveal (see ReorderableRow): start 16px lower at
// opacity 0, then fade and slide up into place. Used for the standalone content
// pieces that take the list's spot — the "Last Loaded" banner, the error text,
// and the empty state — so they read as part of the same cascade rather than a
// different kind of fade. Kept shorter than the row reveal so it clears the
// way before the list cascade finishes starting.
const CONTENT_REVEAL = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 16 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: Easing.inOut(Easing.quad) },
})
  .duration(160)
  .delay(GRADES_STANDALONE_CONTENT_REVEAL_DELAY_MS);

interface GradesTermPageProps {
  active: boolean;
  isLoading: boolean;
  dataStillLoading: boolean;
  progress?: { percent: number; message: string };
  error: string | null;
  orderedClasses: Course[];
  storageMode: boolean;
  lastLoaded?: number;
  animationsEnabled: boolean;
  alreadyRevealed: boolean;
  onFirstReveal: () => void;
  gradesView: 'list' | 'card';
  hideColors: boolean;
  numberDisplay: 'decimal' | 'rounded' | 'letter' | 'letter+';
  cardHeight: number;
  onMeasureCardHeight: (h: number) => void;
  onReorder: (next: Course[]) => void;
  onOpenCourse: (course: Course) => void;
  onLoadFromStorage: () => void;
  canLoadFromStorage: boolean;
  storageLoadPulse: number;
}

// One term's whole content area — grades list/grid plus its own loading
// overlay — as a standalone, permanently-mounted component (one instance per
// visited term, kept alive after its first visit, exactly like a bottom-tab
// screen). Living in its own component (rather than being re-derived from a
// single `currentTerm` state) is what lets several terms sit side by side in
// the sliding row below and have the row's transform be the only thing that
// moves — each term's own crossfade/reveal animations run independently and
// don't need to be torn down and rebuilt when you switch away and back.
function GradesTermPage({
  active,
  isLoading,
  dataStillLoading,
  progress,
  error,
  orderedClasses,
  storageMode,
  lastLoaded,
  animationsEnabled,
  alreadyRevealed,
  onFirstReveal,
  gradesView,
  hideColors,
  numberDisplay,
  cardHeight,
  onMeasureCardHeight,
  onReorder,
  onOpenCourse,
  onLoadFromStorage,
  canLoadFromStorage,
  storageLoadPulse,
}: GradesTermPageProps) {
  // Latch the last real progress value so the loading block fades out frozen
  // at "100% / Done!" instead of collapsing to 0%/no-text once the entry is
  // cleared out of the parent's progress map.
  const lastProgressRef = React.useRef(progress);
  if (progress) lastProgressRef.current = progress;
  const displayProgress = progress ?? lastProgressRef.current;

  // Frozen at mount: whether this term's very first list reveal should play
  // its cascade. Fixed per-instance (not re-derived on every render) because
  // the list's rows only mount once they measure their width, by which point
  // a live re-derivation would have already flipped to "already revealed".
  const [shouldAnimateReveal] = React.useState(() => animationsEnabled && !alreadyRevealed);
  React.useEffect(() => {
    if (!isLoading && orderedClasses.length > 0) onFirstReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // Manual crossfade between the loading block and the grades content,
  // instead of Reanimated's `entering`/`exiting` props — those unmount the
  // loading block the instant `isLoading` flips, so the two never actually
  // overlap (a blank flash between them). Content's mount condition
  // (`!isLoading`) is read fresh every render rather than from a separate
  // effect-driven state, so switching to this term while it's still loading
  // never flashes a stale "content" frame first.
  const [loadingFadingOut, setLoadingFadingOut] = React.useState(isLoading);
  const loadingOpacity = useSharedValue(isLoading ? 1 : 0);

  // Guards the very first run of the effect below: `useLayoutEffect` always
  // fires once right after mount, even when `isLoading` is already `false` at
  // that point (e.g. a term whose data came from "Load from Storage" and was
  // never in a loading state at all). On that first mount there is nothing to
  // animate FROM — either the loading block was already the only thing
  // visible (isLoading true), or the transition into this state already
  // played out in whatever screen showed before this page existed (the
  // top-level `InitialLoadingOverlay`, for the very-first term). So the first
  // run always snaps straight to the correct steady state instead of kicking
  // off a fade.
  const mountedRef = React.useRef(false);
  // Tracks the last `storageLoadPulse` this effect actually reacted to, so a
  // later, unrelated `isLoading` change (e.g. pressing Refresh) doesn't fall
  // into the "just got storage data" branch just because the pulse count is
  // still > 0 from an earlier press — that forced the block to snap back to
  // visible and immediately re-fade-out from under a genuinely fresh fetch.
  const lastHandledPulseRef = React.useRef(storageLoadPulse);

  // useLayoutEffect, not useEffect: `loadingFadingOut` must flip in the same
  // pre-paint tick `isLoading` does, or there's one painted frame where both
  // are false — the block unmounts and instantly remounts (an intermittent
  // flash off-then-on).
  React.useLayoutEffect(() => {
    const pulseIsNew = storageLoadPulse !== lastHandledPulseRef.current;
    lastHandledPulseRef.current = storageLoadPulse;

    if (!mountedRef.current) {
      mountedRef.current = true;
      loadingOpacity.value = isLoading ? 1 : 0;
      setLoadingFadingOut(isLoading);
      return;
    }
    if (!animationsEnabled) {
      loadingOpacity.value = isLoading ? 1 : 0;
      setLoadingFadingOut(false);
      return;
    }
    if (pulseIsNew && storageLoadPulse > 0) {
      loadingOpacity.value = 1;
      setLoadingFadingOut(true);
      loadingOpacity.value = withTiming(0, { duration: GRADES_CROSSFADE_MS }, (finished) => {
        if (finished) runOnJS(setLoadingFadingOut)(false);
      });
      return;
    }
    if (isLoading) {
      setLoadingFadingOut(true);
      loadingOpacity.value = withTiming(1, { duration: GRADES_CROSSFADE_MS });
    } else {
      setLoadingFadingOut(true);
      loadingOpacity.value = withTiming(0, { duration: GRADES_CROSSFADE_MS }, (finished) => {
        if (finished) runOnJS(setLoadingFadingOut)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, animationsEnabled, storageLoadPulse]);

  // Fade and slide in lockstep: as it fades out (1 → 0) it drifts 16px down;
  // on the way in (0 → 1) it settles up from 16px below — the mirror of the
  // grade rows' own rise.
  const loadingAnimatedStyle = useAnimatedStyle(() => ({
    opacity: loadingOpacity.value,
    transform: [{ translateY: (1 - loadingOpacity.value) * 16 }],
  }));

  const showContentBlock = !isLoading && !loadingFadingOut;
  const showLoadingBlock = isLoading || loadingFadingOut;

  return (
    // `width: '100%'`, not the measured `stageWidth` — that starts at 0 until
    // the stage container's own onLayout fires, and using it directly here
    // squeezed this page (and, transitively, the list's own container-width
    // measurement below it) into a zero-width box for that first frame. On a
    // storage load — where there's no network delay to mask it — that showed
    // up as a tall, near-zero-width sliver of wrapped text on the left edge.
    // The page always fills its parent regardless of the measured width; only
    // the shift/drift math in `TermPageShift` actually needs `stageWidth`.
    <View style={{ width: '100%', position: 'relative' }} pointerEvents={active ? 'auto' : 'none'}>
      {showLoadingBlock && !error && (
        <Animated.View
          style={[
            showContentBlock ? { position: 'absolute', top: 0, left: 0, right: 0 } : undefined,
            animationsEnabled ? loadingAnimatedStyle : undefined,
          ]}>
          <View className="items-center gap-3 py-6">
            <Text className="text-sm text-muted-foreground">{displayProgress?.message}</Text>
            <Progress
              value={displayProgress?.percent ?? 0}
              indicatorClassName="bg-primary"
              className="w-full"
            />
            {/* Kept mounted for the block's whole visible life (not just while
                `dataStillLoading`) so that on press it fades out with the rest of the
                progress block as one unit instead of popping away first. Only
                interactive while genuinely loading; during the done/fade-out tail
                it's along for the fade only. */}
            <View pointerEvents={dataStillLoading ? 'auto' : 'none'}>
              <Button variant="outline" size="sm" onPress={onLoadFromStorage} disabled={!canLoadFromStorage}>
                <Text>Load from Storage</Text>
              </Button>
            </View>
          </View>
        </Animated.View>
      )}

      {showContentBlock && (
        <View>
          {!error && storageMode && (
            <Animated.View
              entering={animationsEnabled ? CONTENT_REVEAL : undefined}
              className="mb-2 rounded-lg bg-muted p-3">
              <Text className="text-sm text-muted-foreground">
                Last Loaded: {lastLoaded ? dateFormatter.format(new Date(lastLoaded)) : ''}
              </Text>
            </Animated.View>
          )}

          {error && (
            <Animated.Text
              entering={animationsEnabled ? CONTENT_REVEAL : undefined}
              className="py-6 text-center text-destructive">
              {error}
            </Animated.Text>
          )}

          {!error && orderedClasses.length === 0 && (
            <Animated.Text
              entering={animationsEnabled ? CONTENT_REVEAL : undefined}
              className="py-6 text-center text-muted-foreground">
              No classes to display
            </Animated.Text>
          )}

          {!error && orderedClasses.length > 0 && (
            <>
              {gradesView === 'list' ? (
                <ReorderableList
                  items={orderedClasses}
                  keyExtractor={(c) => c.course}
                  itemHeight={68}
                  gap={8}
                  animateReveal={shouldAnimateReveal}
                  revealDelayMs={GRADES_CONTENT_REVEAL_DELAY_MS}
                  onReorder={onReorder}
                  renderItem={(course, isDragging) => (
                    <GradesItem
                      courseName={course.name}
                      id={course.course}
                      grade={course.average}
                      hideColors={hideColors}
                      numberDisplay={numberDisplay}
                      variant="list"
                      onPress={() => !isDragging && onOpenCourse(course)}
                    />
                  )}
                />
              ) : (
                <>
                  {/* Offscreen probe to measure a card's natural height once, so the
                      grid below can position its absolutely-laid-out rows. */}
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', opacity: 0, left: 0, width: '48%' }}
                    onLayout={(e) => {
                      const h = Math.round(e.nativeEvent.layout.height);
                      if (h > 0) onMeasureCardHeight(h);
                    }}>
                    <GradesItem
                      courseName={orderedClasses[0].name}
                      id={orderedClasses[0].course}
                      grade={orderedClasses[0].average}
                      hideColors={hideColors}
                      numberDisplay={numberDisplay}
                      variant="card"
                    />
                  </View>
                  {cardHeight > 0 && (
                    <ReorderableList
                      items={orderedClasses}
                      keyExtractor={(c) => c.course}
                      itemHeight={cardHeight}
                      gap={12}
                      numColumns={2}
                      columnGap={12}
                      animateReveal={shouldAnimateReveal}
                      revealDelayMs={GRADES_CONTENT_REVEAL_DELAY_MS}
                      onReorder={onReorder}
                      renderItem={(course, isDragging) => (
                        <GradesItem
                          courseName={course.name}
                          id={course.course}
                          grade={course.average}
                          hideColors={hideColors}
                          numberDisplay={numberDisplay}
                          variant="card"
                          onPress={() => !isDragging && onOpenCourse(course)}
                        />
                      )}
                    />
                  )}
                </>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// Matches the CSS `ease` the bottom-tab shift and the rest of the app use, so
// the cross-fade's motion curve is identical to switching bottom tabs.
const EASE_SHIFT = Easing.bezier(0.25, 0.1, 0.25, 1);

interface TermPageShiftProps {
  termIndex: number;
  // A single normalized transition: `progress` runs 0→1 while `fromIndex` fades
  // out toward `-direction` and `toIndex` fades in from `+direction`. Normalized
  // (not an index sweep) so ONLY those two pages ever animate — jumping across a
  // span, e.g. term 6→3, never lights up the pages in between.
  progress: SharedValue<number>;
  fromIndex: SharedValue<number>;
  toIndex: SharedValue<number>;
  direction: SharedValue<number>;
  stageWidth: number;
  isActive: boolean;
  animationsEnabled: boolean;
  children: React.ReactNode;
}

// One term page in the stacked cross-fade. All pages occupy the same box (the
// active one in normal flow so it drives the stage's height; the rest absolute
// overlays). A page is only ever visible if it's the source or destination of
// the current transition — every other page stays at opacity 0, so a multi-tab
// jump shows just the two endpoints fading past each other, nothing between.
function TermPageShift({
  termIndex,
  progress,
  fromIndex,
  toIndex,
  direction,
  stageWidth,
  isActive,
  animationsEnabled,
  children,
}: TermPageShiftProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const offset = stageWidth * GRADES_TERM_SHIFT_OFFSET;
    if (termIndex === toIndex.value) {
      // Incoming: fades in (0→1) drifting from the travel direction into place.
      return { opacity: p, transform: [{ translateX: (1 - p) * direction.value * offset }] };
    }
    if (termIndex === fromIndex.value) {
      // Outgoing: fades out (1→0) drifting the same way, off the opposite edge.
      return { opacity: 1 - p, transform: [{ translateX: -p * direction.value * offset }] };
    }
    // Not part of this transition — kept mounted but fully hidden.
    return { opacity: 0, transform: [{ translateX: 0 }] };
  });

  // The active page stays in normal flow so the stage is exactly as tall as the
  // visible term; the others are absolute so they overlay without adding height.
  const base = isActive
    ? ({ position: 'relative' } as const)
    : ({ position: 'absolute', top: 0, left: 0, right: 0 } as const);

  return (
    <Animated.View
      pointerEvents={isActive ? 'auto' : 'none'}
      style={[
        base,
        animationsEnabled ? animatedStyle : isActive ? undefined : { opacity: 0 },
      ]}>
      {children}
    </Animated.View>
  );
}

export default function Screen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { gradesView, hideColors, numberDisplay, showPageTitles, animationsEnabled } = useAppSettings();
  const user = useCurrentUser();
  const toolMode = useStore((s) => s.toolMode);
  const setToolMode = useStore((s) => s.setToolMode);

  // While a Tools mode is active, Android back exits to the Tools tab instead
  // of falling through to the default (which — since this tab has nothing
  // beneath it in the root stack — would otherwise close the app).
  useFocusEffect(
    React.useCallback(() => {
      if (!toolMode) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setToolMode(null);
        router.navigate('/tools' as any);
        return true;
      });
      return () => sub.remove();
    }, [toolMode, setToolMode, router])
  );

  const [terms, setTerms] = React.useState<string[]>([]);
  const [currentTerm, setCurrentTerm] = React.useState('');
  const [subterms, setSubterms] = React.useState<Record<string, string[]>>({});
  const [selectedSubterm, setSelectedSubterm] = React.useState('All');
  const [dataFormat, setDataFormat] = React.useState<'scores' | 'terms' | null>(null);
  const [classesByTerm, setClassesByTerm] = React.useState<Record<string, Course[]>>({});
  const [rawTermClasses, setRawTermClasses] = React.useState<Course[]>([]);
  const [loadingTerms, setLoadingTerms] = React.useState<Record<string, boolean>>({});
  const [progressByTerm, setProgressByTerm] = React.useState<
    Record<string, { percent: number; message: string }>
  >({});
  const [errorByTerm, setErrorByTerm] = React.useState<Record<string, string | null>>({});
  const [courseOrderByTerm, setCourseOrderByTerm] = React.useState<Record<string, string[] | null>>({});
  const [courseOrderLoadedTerms, setCourseOrderLoadedTerms] = React.useState<Record<string, boolean>>({});
  // Whether the "100% / Done!" state has been shown long enough to move on —
  // set after `GRADES_DONE_HOLD_MS` once a fetch pins its progress to 100, so
  // that state is actually visible instead of flashing by for a frame.
  const [doneHoldElapsed, setDoneHoldElapsed] = React.useState<Record<string, boolean>>({});
  // Whether a term's currently-shown data came from local storage (via "Load
  // from Storage") rather than a fresh network fetch, and when that snapshot
  // was captured — drives the "Last Loaded: ..." banner, mirroring the web app.
  const [storageModeByTerm, setStorageModeByTerm] = React.useState<Record<string, boolean>>({});
  const [lastLoadedByTerm, setLastLoadedByTerm] = React.useState<Record<string, number>>({});
  const [storageLoadPulseByTerm, setStorageLoadPulseByTerm] = React.useState<Record<string, number>>({});
  // Measured natural height of a single grade card, used to lay out the
  // reorderable 2-column grid. Card content is all single-line, so its height
  // is constant regardless of column width. Shared across every term's page
  // since card sizing doesn't vary by term.
  const [cardHeight, setCardHeight] = React.useState(0);
  // Terms that have ever been selected — each gets its own permanently-mounted
  // `GradesTermPage` (see the sliding row below), exactly like a bottom-tab
  // screen staying mounted after its first visit. `currentTerm` itself is
  // always included even before this state's effect below has run, to avoid a
  // one-frame gap where the active term has no page yet.
  const [visitedTerms, setVisitedTerms] = React.useState<Record<string, boolean>>({});

  const userHasSelectedTerm = React.useRef(false);
  // Tracks which terms have already played their reveal-on-load animation so
  // revisiting an already-loaded tab doesn't replay it (see `GradesTermPage`'s
  // `alreadyRevealed`/`onFirstReveal`).
  const revealedTermsRef = React.useRef<Set<string>>(new Set());
  const doneHoldTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // A fetch whose key is flagged here has been superseded (e.g. the user tapped
  // "Load from Storage" while it was still in flight). Its async generator can't
  // be cancelled, so instead we drop every state write it tries to make from
  // that point on — otherwise its trailing progress ticks and its eventual
  // success would re-drive the loading UI and make the bar flash back in after
  // the storage data had already been shown.
  const abandonedFetchKeys = React.useRef<Record<string, boolean>>({});

  React.useEffect(() => {
    return () => {
      Object.values(doneHoldTimers.current).forEach(clearTimeout);
    };
  }, []);

  React.useEffect(() => {
    if (!currentTerm) return;
    setVisitedTerms((prev) => (prev[currentTerm] ? prev : { ...prev, [currentTerm]: true }));
  }, [currentTerm]);

  const scheduleDoneHold = React.useCallback((key: string) => {
    if (doneHoldTimers.current[key]) clearTimeout(doneHoldTimers.current[key]);
    doneHoldTimers.current[key] = setTimeout(() => {
      // Deferred past any in-flight navigation transition/interaction — firing
      // a setState mid-transition (e.g. right as another screen is pushed)
      // could race with that screen's own render and trip React's "setState
      // while rendering a different component" warning.
      InteractionManager.runAfterInteractions(() => {
        setDoneHoldElapsed((prev) => ({ ...prev, [key]: true }));
      });
    }, GRADES_DONE_HOLD_MS);
  }, []);

  const fetchClasses = React.useCallback(async (term: string | null, initial = false) => {
    const key = initial ? 'initial' : term!;
    abandonedFetchKeys.current[key] = false;
    setLoadingTerms((prev) => ({ ...prev, [key]: true }));
    setProgressByTerm((prev) => ({
      ...prev,
      [key]: { percent: initial ? 0 : 4, message: 'Initializing Connection' },
    }));
    setDoneHoldElapsed((prev) => ({ ...prev, [key]: false }));
    setErrorByTerm((prev) => ({ ...prev, [key]: null }));

    try {
      for await (const chunk of getClasses(term ?? undefined)) {
        // Superseded by a storage load — stop touching any loading state.
        if (abandonedFetchKeys.current[key]) return;
        if ('percent' in chunk && chunk.percent !== undefined) {
          setProgressByTerm((prev) => ({
            ...prev,
            [key]: { percent: chunk.percent, message: chunk.message },
          }));
        } else if (chunk.success === true) {
          const format: 'scores' | 'terms' = chunk.scoresIncluded ? 'scores' : 'terms';
          setDataFormat(format);

          if (initial) {
            setTerms(chunk.termList);
            if (chunk.subterms) setSubterms(chunk.subterms);
            if (!userHasSelectedTerm.current) setCurrentTerm(chunk.term);

            if (format === 'terms' && chunk.termsIncluded) {
              const raw: Course[] = chunk.classes || [];
              setRawTermClasses(raw);
              const perTerm: Record<string, Course[]> = {};
              chunk.termList.forEach((t: string) => {
                perTerm[t] = [];
              });
              raw.forEach((course) => {
                chunk.termList.forEach((t: string) => {
                  const avg = course.averages?.[t];
                  if (avg !== undefined && avg !== ('' as any) && !isNaN(avg as number)) {
                    perTerm[t].push({ ...course, average: avg });
                  }
                });
              });
              setClassesByTerm((prev) => ({ ...prev, ...perTerm }));
            } else {
              setClassesByTerm((prev) => ({ ...prev, [chunk.term]: chunk.classes }));
            }

            setLoadingTerms((prev) => {
              const next = { ...prev };
              delete next.initial;
              if (format === 'terms') chunk.termList.forEach((t: string) => (next[t] = false));
              else next[chunk.term] = false;
              return next;
            });
            // Pin to 100 rather than deleting the entry: the term's data is
            // ready, but the list is still gated on the async course-order
            // load (see `isLoading`). Deleting here made `progress` fall back
            // to 0 during that gap, so the bar visibly dropped to 0 and then
            // the grades appeared. The stale entry is cleared once loading
            // fully ends (see the cleanup effect below).
            setProgressByTerm((prev) => ({
              ...prev,
              initial: { percent: 100, message: 'Done!' },
            }));
            scheduleDoneHold('initial');
            // Fresh network data supersedes any earlier "loaded from storage" state.
            setStorageModeByTerm((prev) => ({ ...prev, [chunk.term]: false }));
          } else if (term) {
            setClassesByTerm((prev) => ({ ...prev, [term]: chunk.classes }));
            setLoadingTerms((prev) => ({ ...prev, [term]: false }));
            setProgressByTerm((prev) => ({
              ...prev,
              [term]: { percent: 100, message: 'Done!' },
            }));
            scheduleDoneHold(term);
            setStorageModeByTerm((prev) => ({ ...prev, [term]: false }));
          }
        }
      }
    } catch (e: any) {
      setErrorByTerm((prev) => ({ ...prev, [key]: e.message ?? 'Failed to load classes' }));
      setLoadingTerms((prev) => ({ ...prev, [key]: false }));
      // No 100%/"Done!" state to show on failure — let the error render immediately.
      setDoneHoldElapsed((prev) => ({ ...prev, [key]: true }));
    }
  }, []);

  React.useEffect(() => {
    fetchClasses(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!currentTerm) return;
    // Resolve the saved order (if any) BEFORE the list is allowed to render
    // (see `isLoading` below) — otherwise it renders in fetch order first,
    // then visibly jumps to the saved order once this resolves. Tracked per
    // term (not globally) so switching tabs doesn't affect other terms'
    // loading state while they fetch in the background.
    if (courseOrderLoadedTerms[currentTerm]) return;
    getCourseOrder(currentTerm).then((order) => {
      setCourseOrderByTerm((prev) => ({ ...prev, [currentTerm]: order }));
      setCourseOrderLoadedTerms((prev) => ({ ...prev, [currentTerm]: true }));
    });
  }, [currentTerm, courseOrderLoadedTerms]);

  const handleTabChange = (term: string) => {
    userHasSelectedTerm.current = true;
    setCurrentTerm(term);
    setSelectedSubterm('All');
    if (classesByTerm[term] || loadingTerms[term]) return;
    fetchClasses(term);
  };

  const handleLoadFromStorage = (term?: string) => {
    const isInitialLoad = !term && !!loadingTerms.initial;
    const termToLoad = term ?? (isInitialLoad ? getInitialTerm() : currentTerm);
    if (!termToLoad) return;
    const latestLoad = getLatestGradesLoad(termToLoad);
    if (!latestLoad) return;
    // Silence the in-flight fetch this button is short-circuiting, so its
    // remaining progress ticks / success can't re-show the loading UI on top of
    // the storage data we're about to render (the "flash out then in" glitch).
    abandonedFetchKeys.current[isInitialLoad ? 'initial' : termToLoad] = true;
    // MUST stay synchronous. This whole handoff has to land in ONE event-handler
    // commit so `isLoading` drops exactly once and the overlay fades cleanly. An
    // earlier version `await`ed the saved course order first, which split the
    // updates across ticks — the overlay's fade and the term page's reveal then
    // desynced (overlay vanished, "Last Loaded" animated, then the bar replayed
    // its fade late). So mark the order resolved NOW so `isLoading` isn't pinned
    // on `!courseOrderLoaded`, and fetch the real saved order in the background;
    // the list just re-orders (animated) when it arrives instead of blocking.
    if (!courseOrderLoadedTerms[termToLoad]) {
      setCourseOrderLoadedTerms((prev) => ({ ...prev, [termToLoad]: true }));
      getCourseOrder(termToLoad).then((order) => {
        setCourseOrderByTerm((prev) => ({ ...prev, [termToLoad]: order }));
      });
    }
    if (isInitialLoad) {
      setTerms(getTermList());
      setCurrentTerm(termToLoad);
    }
    setClassesByTerm((prev) => ({ ...prev, [termToLoad]: latestLoad.classes }));
    // Deliberately DON'T touch `progressByTerm` here: the overlay should fade
    // out showing whatever it currently reads (frozen via its own
    // `lastProgressRef`), not jump to "100% / Done!" the instant the button is
    // pressed. It just dissolves on the spot as the grades take over.
    setLoadingTerms((prev) => ({ ...prev, initial: false, [termToLoad]: false }));
    setStorageModeByTerm((prev) => ({ ...prev, [termToLoad]: true }));
    setStorageLoadPulseByTerm((prev) => ({ ...prev, [termToLoad]: (prev[termToLoad] ?? 0) + 1 }));
    setLastLoadedByTerm((prev) => ({ ...prev, [termToLoad]: latestLoad.loadedAt }));
    setErrorByTerm((prev) => ({ ...prev, [termToLoad]: null }));
    // This bypasses `fetchClasses`, so nothing would otherwise ever clear the
    // "100%/Done!" hold it normally schedules — `doneHoldElapsed` for this key
    // could still be sitting at `false` from whatever fetch was in flight when
    // the button was pressed, which left `isLoading` stuck true forever (the
    // button itself would vanish since it's gated on the real loading state,
    // but the loading screen never went away). Storage data is available
    // instantly, so there's no hold to show — mark it satisfied directly.
    setDoneHoldElapsed((prev) => ({ ...prev, initial: true, [termToLoad]: true }));
  };

  // Filters + orders a given term's classes for display — generalized over
  // `term`/`subterm` (rather than always reading `currentTerm`/`selectedSubterm`)
  // so every term's `GradesTermPage` can compute its own data independently.
  const getOrderedClassesForTerm = React.useCallback(
    (term: string, subterm: string): Course[] => {
      let filtered: Course[];
      if (dataFormat === 'scores') filtered = classesByTerm[term] || [];
      else if (!term) filtered = [];
      else if (subterm === 'All') filtered = classesByTerm[term] || [];
      else {
        filtered = rawTermClasses
          .filter((course) => {
            const v = course.averages?.[subterm];
            return v !== undefined && v !== ('' as any) && !isNaN(v as number);
          })
          .map((course) => ({ ...course, average: course.averages![subterm] }));
      }
      return applyCourseOrder(filtered, courseOrderByTerm[term] ?? null, (c) => c.course);
    },
    [dataFormat, classesByTerm, rawTermClasses, courseOrderByTerm]
  );

  const handleReorder = (term: string, next: Course[]) => {
    const order = next.map((c) => c.course);
    setCourseOrderByTerm((prev) => ({ ...prev, [term]: order }));
    setCourseOrder(term, order);
  };

  const courseOrderLoaded = !!courseOrderLoadedTerms[currentTerm];
  const progressKey = progressByTerm[currentTerm] ? currentTerm : 'initial';
  const doneHoldPending = !(doneHoldElapsed[progressKey] ?? true);
  // Real data-loading state, without the artificial "100%/Done!" hold — used
  // to gate "Load from Storage", which has nothing left to do once the data
  // has actually arrived. Without this split, the button stayed enabled
  // through the hold window (since the term's storage data now exists) but
  // pressing it did nothing, because there was nothing left to load.
  const dataStillLoading = loadingTerms[currentTerm] || loadingTerms.initial || !courseOrderLoaded;
  const isLoading = dataStillLoading || doneHoldPending;

  // The term/subterm tab bars are held back until the first content reveal.
  // Without this they mount the instant the fetch reports its term list — well
  // before the grades clear the "Done!" hold and the async course-order load —
  // so they popped in "seconds early" and on their own. Once revealed they stay
  // mounted (so switching tabs later doesn't replay their entrance); the grades
  // area below handles its own per-term loading from then on.
  const [chromeRevealed, setChromeRevealed] = React.useState(false);
  React.useEffect(() => {
    if (!isLoading) setChromeRevealed(true);
  }, [isLoading]);
  // `chromeRevealed || !isLoading`, not just `chromeRevealed`: the effect above
  // only sets the state *after* paint, so on the frame loading first ends the
  // tabs would be a frame late — appearing just after the content and nudging it
  // down. The `!isLoading` term shows them in the same frame; `chromeRevealed`
  // then keeps them up through later per-term loading.
  const showTabs = (chromeRevealed || !isLoading) && terms.length > 0;

  // The pre-tabs `InitialLoadingOverlay` fades out IN PLACE (its own opacity,
  // keyed off `isLoading`) rather than being torn off the frame `showTabs`
  // flips true. Gating its mount on `!showTabs` made it cut instantly / replay
  // its exit late and out of sync (esp. on a storage load); this latch keeps it
  // mounted until its own fade reports done via `onFadedOut`.
  const [initialOverlayDone, setInitialOverlayDone] = React.useState(false);

  const handleRefresh = () => {
    useStore.getState().clearCache();
    if (currentTerm) fetchClasses(currentTerm);
    else fetchClasses(null, true);
  };

  const openCourse = (term: string, subterm: string, course: Course) => {
    if (!course.average) return;
    if (toolMode) {
      router.push({
        pathname: '/grades/tools/[type]/[id]',
        params: {
          type: toolMode,
          id: course.course,
          name: course.name,
          average: String(course.average),
          term,
        },
      });
      return;
    }
    router.push({
      pathname: '/grades/[id]',
      params: {
        id: course.course,
        name: course.name,
        average: String(course.average),
        term,
        subterm,
        dataFormat: dataFormat ?? '',
      },
    });
  };

  // Horizontal shift between term pages, mirroring the root tab bar's own
  // "shift" transition (see the `animation: 'shift'` option in
  // app/(tabs)/_layout.tsx): every visited term gets a permanently-mounted
  // `GradesTermPage` laid out side by side in a row (see the JSX below), and
  // switching terms just translates that row — each page's own content and
  // loading animations keep running independently underneath, instead of a
  // frozen snapshot standing in for the outgoing page.
  const [stageWidth, setStageWidth] = React.useState(0);
  // The stacked cross-fade is driven by a single normalized transition: only the
  // page we're leaving (`shiftFrom`) and the page we're going to (`shiftTo`)
  // animate as `shiftProgress` runs 0→1; `shiftDirection` (±1) gives the drift
  // its side. Because it's normalized rather than an index sweep, crossing a
  // span of tabs (e.g. 6→3) fades only those two endpoints — the pages in
  // between never light up. Kept in index-space — width only scales the drift
  // inside each page's worklet — so a `stageWidth` re-measure can't snap it.
  const shiftProgress = useSharedValue(1);
  const shiftFrom = useSharedValue(0);
  const shiftTo = useSharedValue(0);
  const shiftDirection = useSharedValue(0);
  const currentIndex = Math.max(0, terms.indexOf(currentTerm));
  const prevIndexRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (terms.length === 0) return;
    const from = prevIndexRef.current;
    prevIndexRef.current = currentIndex;
    // First positioning (no prior term), animations off, or a re-render at the
    // same index: snap — from and to collapse to the active page, shown at once.
    if (!animationsEnabled || from === null || from === currentIndex) {
      shiftFrom.value = currentIndex;
      shiftTo.value = currentIndex;
      shiftDirection.value = 0;
      shiftProgress.value = 1;
      return;
    }
    // A genuine switch: cross-fade the outgoing page out and the incoming in.
    shiftFrom.value = from;
    shiftTo.value = currentIndex;
    shiftDirection.value = Math.sign(currentIndex - from);
    shiftProgress.value = 0;
    shiftProgress.value = withTiming(1, {
      duration: GRADES_TERM_SHIFT_MS,
      easing: EASE_SHIFT,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, terms.length, animationsEnabled]);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 py-3">
        {showPageTitles ? (
          <Text className="text-2xl font-bold">{toolMode ? TOOL_TITLES[toolMode] : 'Grades'}</Text>
        ) : (
          <View />
        )}
        {toolMode ? (
          <Button
            onPress={() => {
              setToolMode(null);
              router.navigate('/tools' as any);
            }}
            size="icon"
            variant="ghost"
            className="rounded-full">
            <Icon as={ChevronLeft} className="size-5" />
          </Button>
        ) : (
          <Button
            onPress={handleRefresh}
            size="icon"
            variant="ghost"
            className="rounded-full"
            disabled={isLoading}>
            <Icon as={RefreshCw} className="size-5" />
          </Button>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        className="flex-1 px-4">
        {/* Outer relative wrapper so the initial-reveal progress overlay (below)
            can pin itself over the top of the tabs + stage without being pushed
            around when the tabs mount. */}
        <View style={{ position: 'relative' }}>
        {showTabs && (
          <Animated.View
            entering={animationsEnabled ? CONTENT_REVEAL : undefined}
            layout={animationsEnabled ? LinearTransition.duration(GRADES_CROSSFADE_MS) : undefined}>
            <Tabs value={currentTerm} onValueChange={handleTabChange} className="mb-3 w-full">
              <TabsList className="w-full">
                {terms.map((term) => (
                  <TabsTrigger key={term} value={term} className="flex-1">
                    <Text>{term}</Text>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {subterms[currentTerm]?.length > 0 && (
              <Tabs value={selectedSubterm} onValueChange={setSelectedSubterm} className="mb-3 w-full">
                <TabsList className="w-full">
                  {subterms[currentTerm].map((sub) => (
                    <TabsTrigger key={sub} value={sub} className="flex-1">
                      <Text>{sub}</Text>
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="All" className="flex-1">
                    <Text>All</Text>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </Animated.View>
        )}

        {showTabs ? (
          // Stacked cross-fade stage: every visited term's page occupies the
          // same box (active in flow, the rest absolute overlays) and fades
          // between the others via `TermPageShift`. `overflow: hidden` clips the
          // small drift so a fading page never bleeds past the edge.
          <View
            style={{ overflow: 'hidden' }}
            onLayout={(e) => setStageWidth(Math.round(e.nativeEvent.layout.width))}>
            {terms.map((term) => {
              const isActive = term === currentTerm;
              // Never-visited, non-active terms have nothing to show and no
              // layout slot to hold (pages are stacked, not in a row), so skip
              // mounting them entirely until they're first selected.
              if (!isActive && !visitedTerms[term]) return null;
              const subterm = isActive ? selectedSubterm : 'All';
              const courseOrderLoadedForTerm = !!courseOrderLoadedTerms[term];
              const dataStillLoadingForTerm = !!loadingTerms[term] || !courseOrderLoadedForTerm;
              const doneHoldPendingForTerm = !(doneHoldElapsed[term] ?? true);
              const isLoadingForTerm = dataStillLoadingForTerm || doneHoldPendingForTerm;
              return (
                <TermPageShift
                  key={term}
                  termIndex={terms.indexOf(term)}
                  progress={shiftProgress}
                  fromIndex={shiftFrom}
                  toIndex={shiftTo}
                  direction={shiftDirection}
                  stageWidth={stageWidth}
                  isActive={isActive}
                  animationsEnabled={animationsEnabled}>
                  <GradesTermPage
                    active={isActive}
                    isLoading={isLoadingForTerm}
                    dataStillLoading={dataStillLoadingForTerm}
                    progress={progressByTerm[term] ?? progressByTerm.initial}
                    error={errorByTerm[term] ?? null}
                    orderedClasses={getOrderedClassesForTerm(term, subterm)}
                    storageMode={!!storageModeByTerm[term]}
                    lastLoaded={lastLoadedByTerm[term]}
                    animationsEnabled={animationsEnabled}
                    alreadyRevealed={revealedTermsRef.current.has(term)}
                    onFirstReveal={() => revealedTermsRef.current.add(term)}
                    gradesView={gradesView}
                    hideColors={hideColors}
                    numberDisplay={numberDisplay}
                    cardHeight={cardHeight}
                    onMeasureCardHeight={(h) => setCardHeight((prev) => (prev === h ? prev : h))}
                    onReorder={(next) => handleReorder(term, next)}
                    onOpenCourse={(course) => openCourse(term, subterm, course)}
                    onLoadFromStorage={() => handleLoadFromStorage(term)}
                    canLoadFromStorage={hasStorageData(term)}
                    storageLoadPulse={storageLoadPulseByTerm[term] ?? 0}
                  />
                </TermPageShift>
              );
            })}
          </View>
        ) : (
          // Pre-tabs phase: no term is selected yet, so there's nothing to page
          // between — just surface a startup failure if the very first fetch
          // errored (its own loading overlay is the "Initial reveal" block below).
          errorByTerm.initial && (
            <Animated.Text
              entering={animationsEnabled ? CONTENT_REVEAL : undefined}
              className="py-6 text-center text-destructive">
              {errorByTerm.initial}
            </Animated.Text>
          )
        )}

        {/* Initial reveal: see InitialLoadingOverlay. Pinned over the top of the
            whole scroll area so the tabs and grades can animate in beneath it
            without displacing it; fades out in place (its own opacity, keyed off
            `isLoading`) and only unmounts once that fade reports done — so it
            genuinely overlaps the tabs/term page mounting underneath, whether
            the load finished normally or via "Load from Storage". */}
        {!initialOverlayDone && (
          <InitialLoadingOverlay
            isLoading={isLoading}
            dataStillLoading={dataStillLoading}
            progress={progressByTerm[currentTerm] || progressByTerm.initial}
            animationsEnabled={animationsEnabled}
            onLoadFromStorage={() => handleLoadFromStorage()}
            canLoadFromStorage={hasStorageData(loadingTerms.initial ? getInitialTerm() : currentTerm)}
            onFadedOut={() => setInitialOverlayDone(true)}
          />
        )}
        </View>
      </ScrollView>
    </View>
  );
}

interface InitialLoadingOverlayProps {
  isLoading: boolean;
  dataStillLoading: boolean;
  progress?: { percent: number; message: string };
  animationsEnabled: boolean;
  onLoadFromStorage: () => void;
  canLoadFromStorage: boolean;
  // Fired once the fade-out has fully finished, so the parent can drop the
  // overlay for good. The parent keeps it mounted until then — it must NOT be
  // torn off earlier (e.g. the instant tabs appear), or the fade never plays.
  onFadedOut: () => void;
}

// The very first load, before any term tabs exist — pinned over the whole
// scroll area (where the tabs and grades will appear) so it doesn't get shoved
// down when they mount. It fades out IN PLACE the moment `isLoading` flips
// false (never remounting, never snapshotting), so a "Load from Storage" press
// just dissolves it on the spot rather than cutting it and replaying it late.
function InitialLoadingOverlay({
  isLoading,
  dataStillLoading,
  progress,
  animationsEnabled,
  onLoadFromStorage,
  canLoadFromStorage,
  onFadedOut,
}: InitialLoadingOverlayProps) {
  // Latch the last real progress so it fades out frozen at whatever it was
  // showing, instead of blanking if the parent clears the entry mid-fade.
  const lastProgressRef = React.useRef(progress);
  if (progress) lastProgressRef.current = progress;
  const displayProgress = progress ?? lastProgressRef.current;

  const opacity = useSharedValue(1);
  // One-way latch: this overlay is a one-shot. It sits at full opacity while
  // loading, then fades out exactly once and is done. It NEVER fades back in —
  // so no amount of `isLoading` jitter (a stray re-render, a state landing a
  // tick late) can make it disappear-then-reappear. It just stays put until the
  // single fade-out runs.
  const startedFadingRef = React.useRef(false);

  // useLayoutEffect so the fade is armed in the same pre-paint tick `isLoading`
  // flips — no frame where the overlay is at full opacity after content mounts.
  React.useLayoutEffect(() => {
    if (startedFadingRef.current) return; // already faded (or fading) — one-shot
    if (isLoading) return; // still loading: hold at full opacity, mounted
    startedFadingRef.current = true;
    if (!animationsEnabled) {
      opacity.value = 0;
      onFadedOut();
      return;
    }
    opacity.value = withTiming(0, { duration: GRADES_CROSSFADE_MS }, (finished) => {
      if (finished) runOnJS(onFadedOut)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, animationsEnabled]);

  // Fade and slide in lockstep: as it fades out (1 → 0) it drifts 16px down.
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: (1 - opacity.value) * 16 }],
  }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0 },
        animationsEnabled ? animatedStyle : undefined,
      ]}>
      <View className="items-center gap-3 py-6">
        <Text className="text-sm text-muted-foreground">{displayProgress?.message}</Text>
        <Progress
          value={displayProgress?.percent ?? 0}
          indicatorClassName="bg-primary"
          className="w-full"
        />
        <View pointerEvents={dataStillLoading ? 'auto' : 'none'}>
          <Button variant="outline" size="sm" onPress={onLoadFromStorage} disabled={!canLoadFromStorage}>
            <Text>Load from Storage</Text>
          </Button>
        </View>
      </View>
    </Animated.View>
  );
}
