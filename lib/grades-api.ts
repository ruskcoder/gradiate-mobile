import {
  API_PLATFORM_ENDPOINTS,
  API_URL,
  ATTENDANCE_ENDPOINT,
  AUTH_METHODS_ENDPOINT,
  CLASSES_ENDPOINT,
  DISTRICTS_ENDPOINT,
  INFO_ENDPOINT,
  LOGIN_ENDPOINT,
  LOGIN_TYPES,
  PLATFORMS,
  PROGRESS_REPORT_ENDPOINT,
  REPORT_CARD_ENDPOINT,
  SCHEDULE_ENDPOINT,
  BELL_SCHEDULE_ENDPOINT,
  SINGLE_CLASS_ENDPOINT,
  TEACHERS_ENDPOINT,
  TRANSCRIPT_ENDPOINT,
} from '@/lib/constants';
import { addGradesLoad, initializeGradesStore } from '@/lib/grades-store';
import { mergeBaseline } from '@/lib/notification-baseline';
import {
  currentUser,
  getSession,
  setSession,
  useStore,
  whenSecureCredentialsReady,
} from '@/lib/store';
import { pathMerge } from '@/lib/utils';

type Platform = (typeof PLATFORMS)[number];
type LoginType = (typeof LOGIN_TYPES)[number];

/** Identity of the signed-in account, so cached responses never leak across a
 *  sign-out / sign-in into a different account (the cache is a single global
 *  map, not per-user). Without this, re-logging into another account showed the
 *  previous account's grades until a manual refresh. */
function userScope(): string {
  const u = currentUser();
  if (!u) return 'anon';
  return `${u.platform}|${u.link}|${u.username}|${u.studentId || ''}`;
}

function generateCacheKey(endpoint: string, options: Record<string, any> = {}): string {
  const optionsStr = Object.keys(options).length > 0 ? JSON.stringify(options) : 'no-options';
  return `${userScope()}::${endpoint}:${optionsStr}`;
}

function getCachedValue(key: string): any {
  return useStore.getState().getCacheValue(key);
}

/**
 * Return the current user, first waiting for the keystore if this account signs
 * in with a password that hasn't arrived in memory yet.
 *
 * Store rehydration finishes before the keystore read does, so a screen can
 * mount and fetch during that gap. Sending `password: undefined` makes the API
 * reject the request, so wait for the read and re-read the user afterwards —
 * hydration replaces the object rather than mutating it.
 */
async function userWithCredentials() {
  const user = currentUser();
  if (!user) return null;
  if (user.loginType !== 'credentials' || user.password) return user;
  await whenSecureCredentialsReady();
  return currentUser() ?? user;
}

function setCachedValue(key: string, value: any): void {
  useStore.getState().setCacheValue(key, value);
}

/**
 * Handles authentication errors. Sets the store's reauth flag so `login.tsx`
 * (mounted by the root layout's redirect, see app/_layout.tsx) opens straight
 * to the credentials page with the current username locked in, then throws so
 * the caller's own catch block can still surface the message inline.
 */
function handleAuthError(response: Response, data: any): void {
  // Prefer the status code. Streaming responses flush 200 headers before the
  // error is known, so the code also travels in the body as `data.status`.
  const status: number = data?.status ?? response.status ?? 0;

  // Only ever treat a real 401 (or a pending second factor) as "your credentials
  // stopped working". This used to substring-match the message for 'password',
  // 'Invalid', 'Session'... which also matched ordinary 400s — above all
  // "username and password are required for credentials login", the error the
  // API returns when a request goes out before the keystore has handed the
  // password back. That turned a transient startup race into "your password or
  // 2FA has changed", which is why it appeared at random and vanished on relaunch.
  const isAuthError = status === 401 || data?.mfaRequired === true;

  if (isAuthError) {
    const user = currentUser();
    if (user) {
      useStore.getState().setReauthRequired({
        username: user.username,
        district: {
          name: user.district,
          platform: user.platform,
          link: user.link,
          loginType: user.loginType,
          code: user.code,
        },
      });
    }
    throw new Error(data?.message || 'Password expired - please log in again');
  }
}

/**
 * Streams a POST request and yields each newline-delimited JSON chunk as it
 * arrives. React Native's `fetch` does not expose a readable `response.body`
 * stream, so it can only return the full body at once — which would make the
 * grades progress bar jump straight from 0 to done. `XMLHttpRequest` instead
 * exposes `responseText` accumulating as bytes arrive, letting us parse the
 * SSE-style chunks incrementally and surface progress in real time, matching
 * the web app's `getReader()` behavior.
 */
async function* streamPost(endpoint: string, body: any): AsyncGenerator<any> {
  const xhr = new XMLHttpRequest();
  const queue: any[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  let failure: (Error & { status?: number }) | null = null;
  let processedLength = 0;

  const wakeUp = () => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };

  // Parse whatever complete `\n\n`-terminated chunks have arrived since the
  // last call. When `flush` is true (request complete) the trailing partial is
  // treated as a final complete chunk.
  const consume = (text: string, flush: boolean) => {
    let end: number;
    if (flush) {
      end = text.length;
    } else {
      const boundary = text.lastIndexOf('\n\n');
      if (boundary < processedLength) return;
      end = boundary;
    }
    if (end < processedLength) return;
    const ready = text.slice(processedLength, end);
    processedLength = flush ? text.length : end + 2;
    for (const chunk of ready.split('\n\n')) {
      if (chunk.trim()) {
        try {
          queue.push(JSON.parse(chunk));
        } catch {
          // Ignore a chunk that isn't valid JSON yet; more bytes may follow.
        }
      }
    }
    wakeUp();
  };

  xhr.open('POST', endpoint, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onreadystatechange = () => {
    if (xhr.readyState >= XMLHttpRequest.LOADING) {
      consume(xhr.responseText || '', false);
    }
    if (xhr.readyState === XMLHttpRequest.DONE) {
      if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) {
        const err: Error & { status?: number } = new Error(
          'Failed to fetch classes with status code ' + xhr.status
        );
        err.status = xhr.status;
        failure = err;
      } else {
        consume(xhr.responseText || '', true);
      }
      finished = true;
      wakeUp();
    }
  };
  xhr.onerror = () => {
    failure = new Error('Network request failed while fetching classes');
    finished = true;
    wakeUp();
  };
  xhr.send(JSON.stringify(body));

  try {
    while (true) {
      while (queue.length) {
        yield queue.shift();
      }
      if (failure) throw failure;
      if (finished) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    if (xhr.readyState !== XMLHttpRequest.DONE) xhr.abort();
  }
}

/**
 * Authenticate against a platform.
 *
 * Returns the raw API response. Two non-error shapes the caller must handle:
 *   - `{ success: true, ... }`  — logged in.
 *   - `{ mfaRequired: true, mfaType, icons? }` — a ClassLink second factor is
 *     needed. The mid-challenge session is persisted here; the caller shows the
 *     2FA prompt and calls `login` again with `loginDetails.clMFA` set (a PIN
 *     string or the chosen icon filename) to finish.
 *
 * For `classlinkCredentials` the first attempt is sent as a *fresh* login (empty
 * session), and only the 2FA follow-up (`clMFA` present) reuses the stored
 * challenge session — so a leftover session from another account can't hijack a
 * brand-new ClassLink login.
 */
export async function login(
  platform: Platform,
  loginType: LoginType,
  loginDetails: Record<string, string>,
  referralCode: string = ''
) {
  const isClassLinkCreds = loginType === 'classlinkCredentials';
  const isMfaResume = isClassLinkCreds && !!loginDetails.clMFA;
  // A fresh Microsoft cookie handoff must start from an empty session, or the API
  // could reuse a still-fresh session from a previous account instead of seeding
  // the just-captured cookies.
  const isFreshCookieLogin = loginType === 'microsoftSession';
  const session = (isClassLinkCreds && !isMfaResume) || isFreshCookieLogin ? {} : getSession();

  const body = {
    loginType: loginType,
    loginData: loginDetails,
    options: {
      referralCode: referralCode,
    },
    session: session,
  };

  const endpoint = pathMerge(API_URL, API_PLATFORM_ENDPOINTS[platform], LOGIN_ENDPOINT);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  // A 2FA challenge comes back as `success: false, mfaRequired: true`. Persist
  // the challenge-carrying session and hand it back rather than treating it as a
  // failure, so the caller can prompt for the second factor and resume.
  if (data?.mfaRequired) {
    if (data.session) setSession(data.session);
    return data;
  }

  if (!response.ok || data.success == false) {
    throw new Error(data.message || 'Login failed with status code ' + response.status);
  }
  if (data.session) setSession(data.session);
  return data;
}

/**
 * Ask the API whether a portal `link` fronts multiple districts (a shared HAC
 * login `<select>`). Used by the Custom-login flow's "fetch details" step to
 * decide whether to show a district picker. Never throws — on any failure it
 * reports a single-district link so login can proceed.
 */
export async function fetchDistrictDetails(
  platform: Platform,
  link: string
): Promise<{ multiple: boolean; districts: { name: string; value: string }[] }> {
  try {
    const url = pathMerge(API_URL, API_PLATFORM_ENDPOINTS[platform], DISTRICTS_ENDPOINT);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginData: { link } }),
    });
    const data = await response.json();
    if (!response.ok || data.success === false) return { multiple: false, districts: [] };
    return { multiple: !!data.multiple, districts: data.districts || [] };
  } catch {
    return { multiple: false, districts: [] };
  }
}

/**
 * Ask the API which sign-in methods a district's portal offers
 * ({ credentials, microsoft, ssoUrl }), so the login screen can show the right
 * buttons (some PowerSchool districts are credentials-only, others
 * Microsoft-SSO-only). Never throws — on any failure it reports credentials-only
 * so the user can still sign in the normal way.
 */
export async function fetchAuthMethods(
  platform: Platform,
  link: string
): Promise<{ credentials: boolean; microsoft: boolean; ssoUrl: string | null }> {
  try {
    const url = pathMerge(API_URL, API_PLATFORM_ENDPOINTS[platform], AUTH_METHODS_ENDPOINT);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginData: { link } }),
    });
    const data = await response.json();
    if (!response.ok || data.success === false) return { credentials: true, microsoft: false, ssoUrl: null };
    return {
      credentials: data.credentials !== false,
      microsoft: !!data.microsoft,
      ssoUrl: data.ssoUrl || null,
    };
  } catch {
    return { credentials: true, microsoft: false, ssoUrl: null };
  }
}

/**
 * The shared body of every non-streaming, authenticated data fetch: check the
 * cache, POST `{ loginType, loginData, options, session }`, run the auth-error
 * handler on failure, persist the refreshed session, cache, and return.
 *
 * The eight endpoints differ only in their path, their `options`, whether a
 * cached value may be reused (`forceRefresh`), and — for `/info` — whether the
 * request is sent as a *fresh* login (empty session + blank `clsession`) rather
 * than a resumed one. See `getInfo` for why `/info` is special.
 */
async function fetchEndpoint(
  endpoint: string,
  label: string,
  {
    options = {},
    forceRefresh = false,
    freshLogin = false,
  }: { options?: Record<string, any>; forceRefresh?: boolean; freshLogin?: boolean } = {}
) {
  const user = await userWithCredentials();
  if (!user) {
    throw new Error('No user logged in');
  }

  // Multi-student portals: pin every request to the chosen student.
  if (user.studentId) options = { ...options, studentId: user.studentId };

  const cacheKey = generateCacheKey(endpoint, options);
  if (!forceRefresh) {
    const cachedData = getCachedValue(cacheKey);
    if (cachedData) return cachedData;
  }

  // A Microsoft-SSO account has no password — its auth is the captured portal
  // cookies, which the API re-seeds from `loginData.cookies`. So it must never be
  // sent as a "fresh login" (which blanks the session) — the cookies ARE the login.
  const isMsSession = user.loginType === 'microsoftSession';
  const effectiveFresh = freshLogin && !isMsSession;

  const body = {
    loginType: user.loginType,
    loginData: {
      username: user.username,
      password: user.password,
      link: user.link,
      clsession: effectiveFresh ? '' : user.clsession,
      // Portal cookies for a Microsoft-SSO account (empty otherwise).
      cookies: user.psCookies,
      // Carried so the API can silently re-run a ClassLink login (clearing 2FA
      // with the stored answer) if the portal session has expired. Empty for
      // non-ClassLink accounts.
      code: user.code,
      clMFA: user.clMFA,
    },
    options,
    session: effectiveFresh ? {} : getSession(),
  };

  const url = pathMerge(API_URL, API_PLATFORM_ENDPOINTS[user.platform], endpoint);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    handleAuthError(response, data);
    throw new Error(data.message || `Failed to fetch ${label} with status code ${response.status}`);
  }
  if (data.session) setSession(data.session);

  setCachedValue(cacheKey, data);

  return data;
}

export function getAttendance(date?: string) {
  return fetchEndpoint(ATTENDANCE_ENDPOINT, 'attendance', { options: { date: date || '' } });
}

export async function* getClasses(term?: string) {
  const user = await userWithCredentials();
  const session = getSession();
  if (!user) {
    throw new Error('No user logged in');
  }

  const options: Record<string, any> = { term: term || '' };
  if (user.studentId) options.studentId = user.studentId;
  const cacheKey = generateCacheKey(CLASSES_ENDPOINT, options);

  const cachedData = getCachedValue(cacheKey);
  if (cachedData) {
    yield cachedData;
    return;
  }

  const body = {
    loginType: user.loginType,
    loginData: {
      username: user.username,
      password: user.password,
      link: user.link,
      clsession: user.clsession,
      cookies: user.psCookies,
      code: user.code,
      clMFA: user.clMFA,
    },
    options: options,
    session: session,
    stream: true,
  };

  const endpoint = pathMerge(API_URL, API_PLATFORM_ENDPOINTS[user.platform], CLASSES_ENDPOINT);

  async function handleParsedChunk(data: any) {
    if (data.success === true) {
      if (data.session) setSession(data.session);
      setCachedValue(cacheKey, data);
      // Record what we've now seen, so the next grade check — which may run in a
      // fresh process after this one is gone — has something to diff against.
      // AWAITED, not fire-and-forget: in a headless push wake, React Native is
      // torn down a couple of seconds after the task returns and drops anything
      // still queued ("Tried to enqueue runnable on already finished thread"),
      // which would silently lose the write and leave the baseline stale.
      await mergeBaseline(data);

      if (term) {
        addGradesLoad(term, data.classes);
      } else {
        initializeGradesStore(data.term, data.termList, data.term, data.classes, {
          termTree: data.termTree,
          currentTerms: data.currentTerms,
          hasSubterms: data.hasSubterms,
        });
      }
    }
    return data;
  }

  try {
    for await (const data of streamPost(endpoint, body)) {
      // A `success: false` chunk arrives over a 200 response (the stream itself
      // succeeded), so `streamPost` never throws — check it here, otherwise an
      // invalid-password stream would be silently ignored and never trigger the
      // reauth flow the way the non-streaming endpoints do.
      if (data.success === false) {
        handleAuthError({ status: 0 } as Response, data);
        throw new Error(data.message || 'Failed to fetch classes');
      }

      if (data.percent !== undefined && data.message !== undefined) {
        yield {
          percent: data.percent,
          message: data.message,
        };
      }

      if (data.success === true) {
        yield await handleParsedChunk(data);
        return;
      }
    }
  } catch (e: any) {
    handleAuthError({ status: e?.status } as Response, { message: 'Failed to fetch classes' });
    throw e;
  }
}

export function getSingleClass(
  term: string,
  course: string,
  opts?: { subterm?: string; forceRefresh?: boolean }
) {
  const subterm = opts?.subterm;
  const options =
    subterm && subterm !== 'All' ? { term: subterm, course } : { term, course };
  return fetchEndpoint(SINGLE_CLASS_ENDPOINT, 'single class', {
    options,
    forceRefresh: opts?.forceRefresh === true,
  });
}

export function getSchedule() {
  return fetchEndpoint(SCHEDULE_ENDPOINT, 'schedule');
}

export function getBellSchedule() {
  return fetchEndpoint(BELL_SCHEDULE_ENDPOINT, 'bell schedule');
}

export function getTranscript() {
  return fetchEndpoint(TRANSCRIPT_ENDPOINT, 'transcript');
}

export function getReportCard() {
  return fetchEndpoint(REPORT_CARD_ENDPOINT, 'report card');
}

export function getProgressReport() {
  return fetchEndpoint(PROGRESS_REPORT_ENDPOINT, 'progress report');
}

export function getTeachers() {
  return fetchEndpoint(TEACHERS_ENDPOINT, 'teachers');
}

// INFO_ENDPOINT is the same `/info` route `login()` posts to, and the backend
// treats it as a fresh login rather than a resumed session — it re-authenticates
// with username/password/link and scrapes the profile page itself. It still
// needs `link` to know which portal to hit, but it can't have the *resumed*
// `clsession` the other endpoints send (that sent it down a different
// server-side branch that fetched the wrong page, and cheerio crashed loading a
// non-string response). So `freshLogin` sends a blank `clsession` and an empty
// session, exactly like `login()`.
export function getInfo() {
  return fetchEndpoint(INFO_ENDPOINT, 'account info', { freshLogin: true });
}
