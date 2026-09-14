// Cinco Ranch High School 2026–2027 bell schedules. Kept identical to
// gradexis-web/src/lib/bell-schedules.js so both apps show the same periods.
// Lunch-code notes (4A, 4B/45, …) ride along in the period names.
import type { BellSchedule, User } from '@/lib/store';

export const BELL_SCHEDULES_VERSION = 2027;

const p = (name: string, startTime: string, endTime: string) => ({ name, startTime, endTime });

const REGULAR_START = [
  p('Period 1', '7:15 AM', '8:05 AM'),
  p('Period 1.5', '8:05 AM', '8:35 AM'),
  p('Period 2', '8:42 AM', '9:30 AM'),
  p('Period 3', '9:37 AM', '10:25 AM'),
];
const REGULAR_END = [p('Period 6', '12:52 PM', '1:40 PM'), p('Period 7', '1:47 PM', '2:35 PM')];
const PEP_START = [
  p('Period 1', '7:15 AM', '8:06 AM'),
  p('Period 2', '8:13 AM', '9:00 AM'),
  p('Period 3', '9:07 AM', '9:54 AM'),
];
const PEP_END = [
  p('Period 6', '12:19 PM', '1:06 PM'),
  p('Period 7', '1:13 PM', '2:00 PM'),
  p('Pep Rally', '2:00 PM', '2:35 PM'),
];

export const CRHS_BELL_SCHEDULES: BellSchedule[] = [
  {
    name: 'CRHS - A Lunch',
    periods: [
      ...REGULAR_START,
      p('A Lunch (4A)', '10:25 AM', '10:55 AM'),
      p('Period 4 (4B/45)', '11:02 AM', '11:50 AM'),
      p('Period 5 (5B/56)', '11:57 AM', '12:45 PM'),
      ...REGULAR_END,
    ],
  },
  {
    name: 'CRHS - B Lunch',
    periods: [
      ...REGULAR_START,
      p('Period 4 (4A/4B)', '10:32 AM', '11:20 AM'),
      p('B Lunch (45)', '11:20 AM', '11:50 AM'),
      p('Period 5 (5B/56)', '11:57 AM', '12:45 PM'),
      ...REGULAR_END,
    ],
  },
  {
    name: 'CRHS - C Lunch',
    periods: [
      ...REGULAR_START,
      p('Period 4 (4A/4B)', '10:32 AM', '11:20 AM'),
      p('Period 5 (45/5B)', '11:27 AM', '12:15 PM'),
      p('C Lunch (56)', '12:15 PM', '12:45 PM'),
      ...REGULAR_END,
    ],
  },
  {
    name: 'CRHS Pep Rally - A Lunch',
    periods: [
      ...PEP_START,
      p('A Lunch (4A)', '9:54 AM', '10:24 AM'),
      p('Period 4 (4B/45)', '10:31 AM', '11:18 AM'),
      p('Period 5 (5B/56)', '11:25 AM', '12:12 PM'),
      ...PEP_END,
    ],
  },
  {
    name: 'CRHS Pep Rally - B Lunch',
    periods: [
      ...PEP_START,
      p('Period 4 (4A/4B)', '10:01 AM', '10:48 AM'),
      p('B Lunch (45)', '10:48 AM', '11:18 AM'),
      p('Period 5 (5B/56)', '11:25 AM', '12:12 PM'),
      ...PEP_END,
    ],
  },
  {
    name: 'CRHS Pep Rally - C Lunch',
    periods: [
      ...PEP_START,
      p('Period 4 (4A/4B)', '10:01 AM', '10:48 AM'),
      p('Period 5 (45/5B)', '10:55 AM', '11:42 AM'),
      p('C Lunch (56)', '11:42 AM', '12:12 PM'),
      ...PEP_END,
    ],
  },
];

const isCrhs = (s: BellSchedule | undefined) => /^CRHS\b/.test(s?.name || '');

/**
 * One-time upgrade to this year's schedules. Replaces any older "CRHS…"
 * schedules (keeping custom ones) for accounts that had them or attend Cinco
 * Ranch. Returns the new list, or null when nothing should change.
 */
export function migrateBellSchedules(user: User | null | undefined): BellSchedule[] | null {
  if (!user || user.bellSchedulesVersion === BELL_SCHEDULES_VERSION) return null;
  const existing = user.bellSchedules || [];
  const atCrhs = /cinco ranch/i.test(`${user.school || ''} ${user.district || ''}`);
  if (!atCrhs && !existing.some(isCrhs)) return existing;
  return [...CRHS_BELL_SCHEDULES, ...existing.filter((s) => !isCrhs(s))];
}
