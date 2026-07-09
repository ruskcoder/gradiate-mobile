/**
 * Microsoft-SSO sign-in via WebView cookie handoff.
 *
 * We can't reliably script the Azure AD sign-in server-side (its risk engine
 * bounces bots and it can't clear MFA). Instead we open the portal's own OIDC
 * entry point in a real WebView: the user signs in through Microsoft's genuine UI
 * — MFA, Conditional Access, "stay signed in", all handled natively — and when
 * the flow lands back on the authenticated PowerSchool home page, we read the
 * portal session cookies out of the native cookie store and hand them up. The
 * caller sends them to the API as a `microsoftSession` login.
 *
 * "Authenticated" is detected by content, not URL: injected JS reports back when
 * the loaded page is a real guardian page (it has the student switcher / grade
 * grid / student name), which is unambiguous even though the start URL is also a
 * guardian URL.
 *
 * Persisting the WebView's own cookies (shared/third-party cookies enabled) keeps
 * Microsoft's "stay signed in" cookie around, so a later silent refresh (open in
 * `silent` mode) can complete without the user typing anything again.
 */

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getCookieHeader } from '@/lib/cookie-manager';
import * as React from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

// Runs after every navigation; posts 'AUTHED' once a genuine guardian page loads.
const DETECT_AUTHED_JS = `
(function () {
  try {
    var authed = document.getElementById('firstlast')
      || document.getElementById('students-list')
      || document.querySelector('table.linkDescList')
      || document.querySelector('#pluginNav, #btn-gradesAttendance');
    var isSignIn = document.querySelector('input[name="dbpw"], input[name="passwd"], input[name="loginfmt"]');
    if (authed && !isSignIn) window.ReactNativeWebView.postMessage('AUTHED');
  } catch (e) {}
  true;
})();
`;

export function MicrosoftWebView({
  visible,
  ssoUrl,
  portalLink,
  silent = false,
  onCaptured,
  onCancel,
}: {
  visible: boolean;
  ssoUrl: string;
  portalLink: string;
  silent?: boolean;
  onCaptured: (cookies: string) => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const captured = React.useRef(false);
  const [capturing, setCapturing] = React.useState(false);

  React.useEffect(() => {
    // Resets both the ref and the state together as one atomic transition when
    // the modal opens; can't move to render since ref writes aren't allowed there either.
    if (visible) {
      captured.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCapturing(false);
    }
  }, [visible]);

  const tryCapture = React.useCallback(async () => {
    if (captured.current) return;
    captured.current = true;
    setCapturing(true);
    // Let the portal finish setting its cookies before we read them.
    await new Promise((r) => setTimeout(r, 400));
    const cookies = await getCookieHeader(portalLink);
    if (cookies && /JSESSIONID|pssession|ASP\.NET_SessionId|psaid/i.test(cookies)) {
      onCaptured(cookies);
    } else {
      // No usable session cookie yet — allow another detection to retry.
      captured.current = false;
      setCapturing(false);
    }
  }, [portalLink, onCaptured]);

  const onNav = (nav: WebViewNavigation) => {
    // Fallback for platforms where injected JS is slow: the authenticated landing
    // is a guardian page reached after leaving for the identity provider.
    if (!nav.loading && /\/guardian\/home\.html(\?|$)/.test(nav.url) && !/_userTypeHint=/.test(nav.url)) {
      void tryCapture();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} presentationStyle="fullScreen">
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between border-b border-black/10 bg-white px-4 py-3">
          <Text className="text-base font-semibold">Sign in with Microsoft</Text>
          <Button variant="outline" size="sm" onPress={onCancel}>
            <Text>Cancel</Text>
          </Button>
        </View>

        {silent && (
          <View className="flex-row items-center justify-center gap-2 bg-white py-2">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-black/60">Reconnecting…</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <WebView
            source={{ uri: ssoUrl }}
            incognito={false}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            injectedJavaScript={DETECT_AUTHED_JS}
            onMessage={(e) => {
              if (e.nativeEvent.data === 'AUTHED') void tryCapture();
            }}
            onNavigationStateChange={onNav}
            // Keep the spinner up while we read cookies after detection.
            renderLoading={() => (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" />
              </View>
            )}
            startInLoadingState
          />
          {capturing && (
            <View
              style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
              className="bg-white/70">
              <ActivityIndicator size="large" />
              <Text className="mt-2 text-sm text-black/70">Signing you in…</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
