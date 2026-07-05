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
// everything else out.
function keyFor(user: CredentialUser): string {
  const raw = `${user.platform}:${user.username}:${user.link}`;
  return 'gxpw_' + raw.replace(/[^A-Za-z0-9._-]/g, '_');
}

export async function savePassword(user: CredentialUser, password: string): Promise<void> {
  try {
    if (password) {
      await SecureStore.setItemAsync(keyFor(user), password);
    } else {
      await SecureStore.deleteItemAsync(keyFor(user));
    }
  } catch (e) {
    console.warn('Failed to persist credential to SecureStore', e);
  }
}

export async function loadPassword(user: CredentialUser): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(keyFor(user));
  } catch (e) {
    console.warn('Failed to read credential from SecureStore', e);
    return null;
  }
}

export async function deletePassword(user: CredentialUser): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(keyFor(user));
  } catch (e) {
    console.warn('Failed to delete credential from SecureStore', e);
  }
}
