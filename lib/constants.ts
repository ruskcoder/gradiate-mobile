export const APP_NAME = 'Gradexis';

export const PLATFORMS = ['hac', 'skyward-legacy'] as const;

export const PLATFORM_MAPPING: Record<string, string> = {
  hac: 'HAC',
  'skyward-legacy': 'Skyward Legacy',
};

export interface District {
  name: string;
  platform: string;
  link: string;
  loginType: string;
}

export const LOGIN_TYPES = ['credentials', 'classlink'] as const;

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.gradexis.app/';

export const API_PLATFORM_ENDPOINTS: Record<(typeof PLATFORMS)[number], string> = {
  hac: '/hac/',
  'skyward-legacy': '/skyward-legacy/',
};

export const LOGIN_ENDPOINT = '/info';
export const INFO_ENDPOINT = '/info';
export const CLASSES_ENDPOINT = '/classes';
export const SINGLE_CLASS_ENDPOINT = '/single-class';
export const ATTENDANCE_ENDPOINT = '/attendance';
export const SCHEDULE_ENDPOINT = '/schedule';
export const TRANSCRIPT_ENDPOINT = '/transcript';
export const REPORT_CARD_ENDPOINT = '/reportCard';
export const PROGRESS_REPORT_ENDPOINT = '/ipr';
export const TEACHERS_ENDPOINT = '/teachers';

// Grades list/card reveal animation. Each item fades and slides up on mount,
// offset from the previous one by a constant stagger delay so they cascade in
// one after another (the next item starts after the delay regardless of
// whether the previous item's animation has finished).
export const LIST_REVEAL_STAGGER_MS = 45;
export const LIST_REVEAL_DURATION_MS = 300;
// Duration of the loading block's fade-out and the content container's layout
// settle. Long enough to read as a smooth dissolve rather than a hard cut.
export const GRADES_CROSSFADE_MS = 220;
// Standalone content (Last Loaded, errors, empty state) starts immediately so
// it can overlap with the list reveal instead of blocking it.
export const GRADES_STANDALONE_CONTENT_REVEAL_DELAY_MS = 0;
// The list begins just one stagger step (`LIST_REVEAL_STAGGER_MS`) after the
// "Last Loaded" banner, as if the banner were list item -1 in the same
// cascade — not a separate handoff that waits for the banner's own fade to
// finish before starting.
export const GRADES_CONTENT_REVEAL_DELAY_MS = LIST_REVEAL_STAGGER_MS;
// How long the progress bar sits at 100%/"Done!" before the crossfade to the
// grades list starts, so that state is actually visible instead of flashing by.
export const GRADES_DONE_HOLD_MS = 280;
// Cross-fade "shift" when switching term/subterm tabs, mirroring the root tab
// bar's own transition (see the `animation: 'shift'` screenOption in
// app/(tabs)/_layout.tsx) so this in-screen tab switch reads exactly like
// switching between the bottom tabs. Term pages are stacked on top of each
// other (not laid side by side), and switching cross-fades them: the outgoing
// page fades out while drifting a short distance in the travel direction, and
// the incoming page fades in drifting the same way into place. No page ever
// slides fully across, so pages can't touch/intersect and nothing off the edge
// (the black app background) is ever revealed.
export const GRADES_TERM_SHIFT_MS = 260;
// How far a page drifts during its fade, as a fraction of the stage width. Small
// — the opacity does the heavy lifting; the drift only gives the fade a
// direction. 0.15 ≈ a gentle nudge, matching the subtlety of the bottom tabs.
export const GRADES_TERM_SHIFT_OFFSET = 0.15;
