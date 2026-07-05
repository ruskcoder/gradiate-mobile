import {
  API_PLATFORM_ENDPOINTS,
  API_URL,
  ATTENDANCE_ENDPOINT,
  CLASSES_ENDPOINT,
  INFO_ENDPOINT,
  LOGIN_ENDPOINT,
  LOGIN_TYPES,
  PLATFORMS,
  PROGRESS_REPORT_ENDPOINT,
  REPORT_CARD_ENDPOINT,
  SCHEDULE_ENDPOINT,
  SINGLE_CLASS_ENDPOINT,
  TEACHERS_ENDPOINT,
  TRANSCRIPT_ENDPOINT,
} from '@/lib/constants';
import { addGradesLoad, initializeGradesStore } from '@/lib/grades-store';
import { currentUser, getSession, setSession, useStore } from '@/lib/store';
import { pathMerge } from '@/lib/utils';

type Platform = (typeof PLATFORMS)[number];
type LoginType = (typeof LOGIN_TYPES)[number];

function generateCacheKey(endpoint: string, options: Record<string, any> = {}): string {
  const optionsStr = Object.keys(options).length > 0 ? JSON.stringify(options) : 'no-options';
  return `${endpoint}:${optionsStr}`;
}

function getCachedValue(key: string): any {
  return useStore.getState().getCacheValue(key);
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
  const isAuthError =
    response.status === 401 ||
    data?.message?.includes('Invalid') ||
    data?.message?.includes('password') ||
    data?.message?.includes('Session');

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

export async function login(
  platform: Platform,
  loginType: LoginType,
  loginDetails: Record<string, string>,
  referralCode: string = ''
) {
  const session = getSession();
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

  if (!response.ok || data.success == false) {
    throw new Error(data.message || 'Login failed with status code ' + response.status);
  }
  if (data.session) setSession(data.session);
  return data;
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
  const user = currentUser();
  if (!user) {
    throw new Error('No user logged in');
  }

  const cacheKey = generateCacheKey(endpoint, options);
  if (!forceRefresh) {
    const cachedData = getCachedValue(cacheKey);
    if (cachedData) return cachedData;
  }

  const body = {
    loginType: user.loginType,
    loginData: {
      username: user.username,
      password: user.password,
      link: user.link,
      clsession: freshLogin ? '' : user.clsession,
    },
    options,
    session: freshLogin ? {} : getSession(),
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
  const user = currentUser();
  const session = getSession();
  if (!user) {
    throw new Error('No user logged in');
  }

  const options = { term: term || '' };
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
    },
    options: options,
    session: session,
    stream: true,
  };

  const endpoint = pathMerge(API_URL, API_PLATFORM_ENDPOINTS[user.platform], CLASSES_ENDPOINT);

  function handleParsedChunk(data: any) {
    if (data.success === true) {
      if (data.session) setSession(data.session);
      setCachedValue(cacheKey, data);

      if (term) {
        addGradesLoad(term, data.classes);
      } else {
        initializeGradesStore(data.term, data.termList, data.term, data.classes);
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
        yield handleParsedChunk(data);
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
