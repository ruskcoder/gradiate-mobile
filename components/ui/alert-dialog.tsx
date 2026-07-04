import { buttonTextVariants, buttonVariants, type ButtonProps } from '@/components/ui/button';
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import {
  dialogEntering,
  dialogExiting,
  overlayEntering,
  overlayExiting,
} from '@/lib/ui-animations';
import * as AlertDialogPrimitive from '@rn-primitives/alert-dialog';
import * as React from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function AlertDialogOverlay({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Overlay>, 'asChild'> & {
    children?: React.ReactNode;
  }) {
  const { onOpenChange } = AlertDialogPrimitive.useRootContext();
  return (
    <FullWindowOverlay>
      <AlertDialogPrimitive.Overlay
        className={cn(
          'absolute bottom-0 left-0 right-0 top-0 z-50',
          Platform.select({
            // Web dims the backdrop directly on the overlay; native fades a
            // dedicated layer inside the backdrop Pressable below.
            web: 'animate-in fade-in-0 fixed bg-black/50',
          }),
          className
        )}
        {...props}>
        {/* Backdrop — tapping it dismisses. It sits *below* the centering layer,
            so only taps that miss the card reach it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => onOpenChange(false)}
          style={StyleSheet.absoluteFill}>
          {Platform.OS !== 'web' && (
            <NativeOnlyAnimatedView
              pointerEvents="none"
              entering={overlayEntering}
              exiting={overlayExiting}
              className="absolute bottom-0 left-0 right-0 top-0 bg-black/50"
            />
          )}
        </Pressable>
        {/* `box-none`: this centering layer never captures touches itself, so
            empty space falls through to the backdrop, but the card and its
            buttons (its children) still receive taps normally. */}
        <View
          pointerEvents="box-none"
          className="absolute bottom-0 left-0 right-0 top-0 items-center justify-center p-4">
          <NativeOnlyAnimatedView
            className="w-full max-w-lg"
            entering={dialogEntering}
            exiting={dialogExiting}>
            <>{children}</>
          </NativeOnlyAnimatedView>
        </View>
      </AlertDialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

function AlertDialogContent({
  className,
  portalHost,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
    portalHost?: string;
  }) {
  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogPrimitive.Content
          className={cn(
            // `w-full` was missing from the uniwind registry copy — without it
            // the content shrink-wraps on native (~50% wide, text overflows).
            // The width itself is capped by the `max-w-lg` wrapper in the overlay.
            'bg-background border-border z-50 flex w-full flex-col gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 sm:max-w-lg',
            Platform.select({
              web: 'animate-in fade-in-0 zoom-in-95 web:max-w-[calc(100%-2rem)] duration-200',
            }),
            className
          )}
          {...props}
        />
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
  return (
    <TextClassContext.Provider value="text-center sm:text-left">
      <View className={cn('flex flex-col gap-2', className)} {...props} />
    </TextClassContext.Provider>
  );
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        // Native has no `sm:` breakpoint, so the desktop row layout never
        // kicked in and buttons stacked full-width in reverse. Mirror the
        // desktop look: a right-aligned row.
        Platform.select({ native: 'flex-row justify-end' }),
        className
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('text-foreground text-lg font-semibold', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <AlertDialogPrimitive.Action
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ className, variant: 'outline' })}>
      <AlertDialogPrimitive.Cancel
        className={cn(buttonVariants({ variant: 'outline' }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
