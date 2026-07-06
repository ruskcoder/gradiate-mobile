import * as SecureStore from 'expo-secure-store';
import type { User } from './store';

/**
 * The portal password is the one genuinely sensitive value the app holds (it's
 * a minor's school-login password, reused for silent re-auth). It must NOT sit
 * in the AsyncStorage `user-store` blob, which is plaintext on disk. Instead we
 * mirror each account's password into the OS keystore/keychain via
 * `expo-secure-store` and strip it from the persisted blob (see `store.ts`
 * `partialize`). Passwords live in memory during a session and are rehydrated
 * from SecureStore on launch.
 *
 * NOTE: this changes native credential storage; verify login + relogin on a
 * real device build before shipping.
 */

type CredentialUser = Pick<User, 'username' | 'link' | 'platform'>;

// SecureStore keys may only contain [A-Za-z0-9._-]. Derive a stable per-account
// key from the fields that identify an account (username + portal), sanitizing
// everything else out. `prefix` separates the two secrets an account can hold:
// its portal password and its stored ClassLink 2FA answer.
function keyFor(user: CredentialUser, prefix: string): string {
  const raw = `${user.platform}:${user.username}:${user.link}`;
  return prefix + raw.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function saveSecret(user: CredentialUser, prefix: string, value: string): Promise<void> {
  try {
    if (value) {
      await SecureStore.setItemAsync(keyFor(user, prefix), value);
    } else {
      await SecureStore.deleteItemAsync(keyFor(user, prefix));
    }
  } catch (e) {
    console.warn('Failed to persist credential to SecureStore', e);
  }
}

async function loadSecret(user: CredentialUser, prefix: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(keyFor(user, prefix));
  } catch (e) {
    console.warn('Failed to read credential from SecureStore', e);
    return null;
  }
}

export function savePassword(user: CredentialUser, password: string): Promise<void> {
  return saveSecret(user, 'gxpw_', password);
}

export function loadPassword(user: CredentialUser): Promise<string | null> {
  return loadSecret(user, 'gxpw_');
}

// The stored ClassLink 2FA answer (PIN string / chosen icon filename). Same
// keystore treatment as the password — sensitive, never in AsyncStorage.
export function saveClMFA(user: CredentialUser, clMFA: string): Promise<void> {
  return saveSecret(user, 'gxmfa_', clMFA);
}

export function loadClMFA(user: CredentialUser): Promise<string | null> {
  return loadSecret(user, 'gxmfa_');
}

export async function deletePassword(user: CredentialUser): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(keyFor(user, 'gxpw_'));
    await SecureStore.deleteItemAsync(keyFor(user, 'gxmfa_'));
  } catch (e) {
    console.warn('Failed to delete credential from SecureStore', e);
  }
}
