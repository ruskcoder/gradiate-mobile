import { Icon } from '@/components/ui/icon';
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as SelectPrimitive from '@rn-primitives/select';
import { popoverEntering, popoverExiting } from '@/lib/ui-animations';
import { Check, ChevronDown, ChevronDownIcon, ChevronUpIcon } from 'lucide-react-native';
import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

type Option = SelectPrimitive.Option;

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

function SelectValue({
  ref,
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value> & {
    className?: string;
  }) {
  const { value } = SelectPrimitive.useRootContext();
  return (
    <SelectPrimitive.Value
      ref={ref}
      numberOfLines={1}
      ellipsizeMode="tail"
      className={cn(
        'text-foreground line-clamp-1 flex min-w-0 flex-1 flex-row items-center gap-2 text-sm',
        !value && 'text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

function SelectTrigger({
  ref,
  className,
  children,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
    children?: React.ReactNode;
    size?: 'default' | 'sm';
  }) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'border-input dark:bg-input/30 dark:active:bg-input/50 bg-background flex h-10 flex-row items-center justify-between gap-2 rounded-md border px-3 py-2 shadow-sm shadow-black/5 sm:h-9',
        Platform.select({
          web: 'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:hover:bg-input/50 w-fit whitespace-nowrap text-sm outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0',
        }),
        props.disabled && 'opacity-50',
        size === 'sm' && 'h-8 py-2 sm:py-1.5',
        className
      )}
      {...props}>
      <>{children}</>
      <Icon as={ChevronDown} aria-hidden={true} className="text-muted-foreground size-4 shrink-0" />
    </SelectPrimitive.Trigger>
  );
}

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function SelectContent({
  className,
  children,
  position = 'popper',
  portalHost,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
    className?: string;
    portalHost?: string;
  }) {
  return (
    <SelectPrimitive.Portal hostName={portalHost}>
      <FullWindowOverlay>
        <SelectPrimitive.Overlay style={Platform.select({ native: StyleSheet.absoluteFill })}>
          <TextClassContext.Provider value="text-popover-foreground">
            <NativeOnlyAnimatedView
              className="z-50"
              entering={popoverEntering}
              exiting={popoverExiting}
              // Android draws the content's elevation shadow as a separate
              // compositing pass; without this it re-rasterizes every frame
              // as opacity/scale animate, reading as a flickering artifact
              // around the shadow's edge.
              needsOffscreenAlphaCompositing={Platform.OS === 'android'}>
              <SelectPrimitive.Content
                className={cn(
                  'bg-popover border-border relative z-50 min-w-[8rem] rounded-md border shadow-md shadow-black/5',
                  Platform.select({
                    web: cn(
                      'animate-in fade-in-0 zoom-in-95 origin-(--radix-select-content-transform-origin) max-h-96 overflow-y-auto overflow-x-hidden',
                      props.side === 'bottom' && 'slide-in-from-top-2',
                      props.side === 'top' && 'slide-in-from-bottom-2'
                    ),
                    native: 'p-1',
                  }),
                  position === 'popper' &&
                  Platform.select({
                    web: cn(
                      props.side === 'bottom' && 'translate-y-1',
                      props.side === 'top' && '-translate-y-1'
                    ),
                  }),
                  className
                )}
                // `shadow-*` utilities don't produce an Android elevation, so
                // the popup reads as a flat, borderless block there. This gives
                // it the same floating-card lift the web version has.
                style={Platform.select({
                  native: {
                    elevation: 8,
                    shadowColor: '#000',
                    shadowOpacity: 0.12,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                  },
                })}
                position={position}
                {...props}>
                <SelectScrollUpButton />
                <SelectPrimitive.Viewport
                  className={cn(
                    'p-1',
                    position === 'popper' &&
                    cn(
                      'w-full',
                      Platform.select({
                        web: 'h-[var(--radix-select-trigger-height)] min-w-[var(--radix-select-trigger-width)]',
                      })
                    )
                  )}>
                  {Platform.OS === 'web' ? (
                    children
                  ) : (
                    // The native primitive's Viewport is a plain fragment (no
                    // scroll), so a long list overflows the screen. Bound it and
                    // scroll, mirroring the web content's `max-h-52 overflow-y-auto`.
                    <ScrollView
                      style={{ maxHeight: 288 }}
                      showsVerticalScrollIndicator={true}
                      persistentScrollbar={Platform.OS === 'android'}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled">
                      {children}
                    </ScrollView>
                  )}
                </SelectPrimitive.Viewport>
                <SelectScrollDownButton />
              </SelectPrimitive.Content>
            </NativeOnlyAnimatedView>
          </TextClassContext.Provider>
        </SelectPrimitive.Overlay>
      </FullWindowOverlay>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn('text-muted-foreground px-2 py-2 text-xs sm:py-1.5', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.Item>, 'children'> & {
  children?: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'active:bg-accent group relative flex w-full flex-row items-center gap-2 rounded-sm py-2 pl-2 pr-8 sm:py-1.5',
        Platform.select({
          web: 'focus:bg-accent focus:text-accent-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 cursor-default outline-none data-[disabled]:pointer-events-none [&_svg]:pointer-events-none',
        }),
        props.disabled && 'opacity-50',
        className
      )}
      {...props}>
      <View className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Icon as={Check} className="text-muted-foreground size-4 shrink-0" />
        </SelectPrimitive.ItemIndicator>
      </View>
      {/* Optional leading content (e.g. a color swatch) renders before the
          label; the native primitive only draws `label` text on its own. */}
      {children}
      <SelectPrimitive.ItemText className="text-foreground group-active:text-accent-foreground select-none text-sm" />
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn(
        'bg-border -mx-1 my-1 h-px',
        Platform.select({ web: 'pointer-events-none' }),
        className
      )}
      {...props}
    />
  );
}

/**
 * @platform Web only
 * Returns null on native platforms
 */
function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  if (Platform.OS !== 'web') {
    return null;
  }
  return (
    <SelectPrimitive.ScrollUpButton
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}>
      <Icon as={ChevronUpIcon} className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

/**
 * @platform Web only
 * Returns null on native platforms
 */
function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  if (Platform.OS !== 'web') {
    return null;
  }
  return (
    <SelectPrimitive.ScrollDownButton
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}>
      <Icon as={ChevronDownIcon} className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}


export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  type Option,
};
