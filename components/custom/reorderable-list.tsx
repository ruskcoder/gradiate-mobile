import { LIST_REVEAL_DURATION_MS, LIST_REVEAL_STAGGER_MS } from '@/lib/constants';
import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

interface ReorderableListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, isDragging: boolean) => React.ReactNode;
  onReorder: (items: T[]) => void;
  itemHeight: number;
  /** Vertical gap between rows. */
  gap?: number;
  /** Number of columns. 1 = a plain list, 2+ = a grid (e.g. the cards view). */
  numColumns?: number;
  /** Horizontal gap between columns (only used when `numColumns > 1`). */
  columnGap?: number;
  /** When true, each item plays a staggered fade-up reveal on mount. */
  animateReveal?: boolean;
  /**
   * Delay (ms) before the very first item's reveal begins. Lets a caller hold
   * the cascade back until an outgoing element (e.g. a loading overlay) has
   * mostly faded, so the two motions read as one handoff instead of overlapping.
   */
  revealDelayMs?: number;
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

// Resting (x, y) for a given flat index in the grid. `colStride`/`rowStride`
// already fold in the column/row gaps.
function positionFor(index: number, numColumns: number, colStride: number, rowStride: number) {
  'worklet';
  const col = index % numColumns;
  const row = Math.floor(index / numColumns);
  return { x: col * colStride, y: row * rowStride };
}

function triggerHaptics() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

interface RowProps<T> {
  item: T;
  index: number;
  totalCount: number;
  numColumns: number;
  colWidth: number;
  colStride: number;
  rowStride: number;
  animateReveal: boolean;
  revealDelayMs: number;
  renderItem: (item: T, isDragging: boolean) => React.ReactNode;
  onMove: (from: number, to: number) => void;
  onDrop: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function ReorderableRow<T>({
  item,
  index,
  totalCount,
  numColumns,
  colWidth,
  colStride,
  rowStride,
  animateReveal,
  revealDelayMs,
  renderItem,
  onMove,
  onDrop,
  onDragStart,
  onDragEnd,
}: RowProps<T>) {
  const initial = positionFor(index, numColumns, colStride, rowStride);
  const translateX = useSharedValue(initial.x);
  const translateY = useSharedValue(initial.y);
  const dragOffsetX = useSharedValue(0);
  const dragOffsetY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  // Only ever written from inside the gesture worklets below (never from the
  // effect that syncs `index` -> position) — a previous version wrote to the
  // same "current index" shared value from both the JS-driven effect and the
  // UI-thread gesture callbacks, which raced and corrupted the drag.
  const dragStartIndex = useSharedValue(index);
  const lastReportedIndex = useSharedValue(index);
  // 0 -> hidden/below, 1 -> fully revealed. Starts revealed when animations
  // are off so nothing is invisible.
  const reveal = useSharedValue(animateReveal ? 0 : 1);
  const [dragging, setDragging] = React.useState(false);

  // Play the staggered fade-up reveal once, on mount. Each item's delay is a
  // constant multiple of its index, so they cascade independently — the next
  // one starts after the delay whether or not the previous has finished.
  React.useEffect(() => {
    reveal.value = animateReveal
      ? withDelay(
          revealDelayMs + index * LIST_REVEAL_STAGGER_MS,
          withTiming(1, { duration: LIST_REVEAL_DURATION_MS })
        )
      : 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the resting position in sync when the index (reorder / load) or the
  // measured column geometry changes.
  React.useEffect(() => {
    if (!isDragging.value) {
      const p = positionFor(index, numColumns, colStride, rowStride);
      translateX.value = withTiming(p.x, { duration: 220 });
      translateY.value = withTiming(p.y, { duration: 220 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, numColumns, colStride, rowStride]);

  const setDraggingJS = React.useCallback((value: boolean) => setDragging(value), []);

  // Stable across re-renders (including the one `setDragging` itself
  // triggers mid-drag) so GestureDetector never tears down and reattaches
  // the recognizer while a drag is in progress — that was the actual cause
  // of drags "breaking"/jumping.
  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(350)
        .onStart(() => {
          isDragging.value = true;
          const col = clamp(Math.round(translateX.value / colStride), 0, numColumns - 1);
          const row = Math.max(0, Math.round(translateY.value / rowStride));
          dragStartIndex.value = clamp(row * numColumns + col, 0, totalCount - 1);
          lastReportedIndex.value = dragStartIndex.value;
          runOnJS(triggerHaptics)();
          runOnJS(setDraggingJS)(true);
          runOnJS(onDragStart)();
        })
        .onUpdate((e) => {
          dragOffsetX.value = e.translationX;
          dragOffsetY.value = e.translationY;
          const start = positionFor(dragStartIndex.value, numColumns, colStride, rowStride);
          const col = clamp(Math.round((start.x + e.translationX) / colStride), 0, numColumns - 1);
          const row = Math.max(0, Math.round((start.y + e.translationY) / rowStride));
          const proposed = clamp(row * numColumns + col, 0, totalCount - 1);
          if (proposed !== lastReportedIndex.value) {
            const from = lastReportedIndex.value;
            lastReportedIndex.value = proposed;
            runOnJS(onMove)(from, proposed);
          }
        })
        .onEnd(() => {
          isDragging.value = false;
          const p = positionFor(lastReportedIndex.value, numColumns, colStride, rowStride);
          dragOffsetX.value = withTiming(0, { duration: 150 });
          dragOffsetY.value = withTiming(0, { duration: 150 });
          translateX.value = withTiming(p.x, { duration: 150 });
          translateY.value = withTiming(p.y, { duration: 150 });
          runOnJS(setDraggingJS)(false);
          runOnJS(onDragEnd)();
          runOnJS(onDrop)();
        }),
    [
      numColumns,
      colStride,
      rowStride,
      totalCount,
      onMove,
      onDrop,
      onDragStart,
      onDragEnd,
      setDraggingJS,
      isDragging,
      dragStartIndex,
      lastReportedIndex,
      dragOffsetX,
      dragOffsetY,
      translateX,
      translateY,
    ]
  );

  const style = useAnimatedStyle(() => {
    // While revealing, the item sits 16px lower and fades in.
    const revealShift = (1 - reveal.value) * 16;
    return {
      position: 'absolute',
      left: translateX.value + dragOffsetX.value,
      top: translateY.value + dragOffsetY.value + revealShift,
      width: colWidth,
      opacity: reveal.value,
      zIndex: isDragging.value ? 10 : 0,
      transform: [{ scale: withTiming(isDragging.value ? 1.03 : 1, { duration: 150 }) }],
      shadowOpacity: isDragging.value ? 0.15 : 0,
      shadowRadius: 8,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>{renderItem(item, dragging)}</Animated.View>
    </GestureDetector>
  );
}

export function ReorderableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  itemHeight,
  gap = 8,
  numColumns = 1,
  columnGap = 8,
  animateReveal = false,
  revealDelayMs = 0,
}: ReorderableListProps<T>) {
  const [order, setOrder] = React.useState(items);
  const orderRef = React.useRef(order);
  orderRef.current = order;

  // The column width is derived from the measured container width so a grid
  // lays out correctly at any screen size. A single-column list just fills the
  // full width.
  const [containerWidth, setContainerWidth] = React.useState(0);
  const colWidth =
    numColumns > 1 ? Math.max(0, (containerWidth - columnGap * (numColumns - 1)) / numColumns) : containerWidth;
  const colStride = colWidth + (numColumns > 1 ? columnGap : 0);
  const rowStride = itemHeight + gap;

  // How many rows are currently mid-drag (almost always 0 or 1, a counter
  // just to be safe). While a drag is in progress we must NOT let this
  // effect overwrite `order` out from under it.
  const draggingCountRef = React.useRef(0);
  const handleDragStart = React.useCallback(() => {
    draggingCountRef.current += 1;
  }, []);
  const handleDragEnd = React.useCallback(() => {
    draggingCountRef.current = Math.max(0, draggingCountRef.current - 1);
  }, []);

  // The `items` prop (parent-applied ordering, e.g. from persisted storage)
  // is the source of truth whenever we're not actively dragging. A previous
  // version tried to "preserve the current local arrangement" here by
  // keeping the old key sequence and only splicing in additions/removals —
  // which meant a freshly-loaded persisted order from the parent was always
  // discarded in favor of whatever had rendered first, so saved reorders
  // never actually took effect on reload.
  React.useEffect(() => {
    if (draggingCountRef.current > 0) return;
    setOrder(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const handleMove = React.useCallback((from: number, to: number) => {
    setOrder((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Reads the latest order via a ref rather than depending on `order`
  // directly, so this callback's identity stays stable across every
  // in-progress reorder tick (see the `pan` memo above for why that matters).
  const handleDrop = React.useCallback(() => {
    onReorder(orderRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReorder]);

  const rowCount = Math.ceil(order.length / numColumns);
  const totalHeight = rowCount > 0 ? rowCount * rowStride - gap : 0;
  // Every row is absolutely positioned with an explicit `width: colWidth`
  // (see `ReorderableRow`'s style below), including in the single-column list
  // case — rendering before the container's width is measured collapsed rows
  // to `width: 0`, which crushed the text column and left only the
  // fixed-width grade badge visible in the top-left corner for a frame.
  const ready = containerWidth > 0;

  return (
    <Animated.View
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      style={{ height: totalHeight }}>
      {ready &&
        order.map((item, index) => (
          <ReorderableRow
            key={keyExtractor(item)}
            item={item}
            index={index}
            totalCount={order.length}
            numColumns={numColumns}
            colWidth={colWidth}
            colStride={colStride}
            rowStride={rowStride}
            animateReveal={animateReveal}
            revealDelayMs={revealDelayMs}
            renderItem={renderItem}
            onMove={handleMove}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
    </Animated.View>
  );
}
