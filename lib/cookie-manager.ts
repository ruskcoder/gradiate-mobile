/**
 * Thin wrapper around the native cookie store, isolated here so the underlying
 * module can be swapped in one place.
 *
 * Microsoft-SSO sign-in (see components/custom/microsoft-webview.tsx) happens in a
 * WebView; the PowerSchool session cookie it leaves behind is HttpOnly, so it
 * can't be read from `document.cookie` — we read it from the native cookie store
 * instead and hand it to the API as the `microsoftSession` credential.
 *
 * NOTE: @react-native-cookies/cookies works but is unmaintained and warns about
 * the New Architecture. If it stops reading cookies on a New-Arch build, swap the
 * import below for `react-native-nitro-cookies` (New-Arch native) — the two
 * functions here are the only call sites.
 */

import CookieManager from '@react-native-cookies/cookies';

type CookieRecord = Record<string, { value?: string } | string>;

function toHeader(cookies: CookieRecord): string {
  return Object.entries(cookies)
    .map(([name, c]) => `${name}=${typeof c === 'object' ? (c.value ?? '') : c}`)
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

/**
 * Read all cookies the WebView set for `url` as a "name=value; …" header string.
 * Tries the WebKit store first (iOS WKWebView), then the default store.
 */
export async function getCookieHeader(url: string): Promise<string> {
  try {
    const webkit = (await CookieManager.get(url, true)) as CookieRecord;
    const header = toHeader(webkit);
    if (header) return header;
  } catch {
    /* fall through to the default store */
  }
  try {
    const def = (await CookieManager.get(url)) as CookieRecord;
    return toHeader(def);
  } catch {
    return '';
  }
}

/** Wipe the WebView cookie jar — used when a user removes a Microsoft account. */
export async function clearAllCookies(): Promise<void> {
  try { await CookieManager.clearAll(true); } catch { /* ignore */ }
  try { await CookieManager.clearAll(); } catch { /* ignore */ }
}
