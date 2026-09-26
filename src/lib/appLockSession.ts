/**
 * Whether the PIN has already been entered this app session. Deliberately a
 * module-level flag (not React state, not persisted storage): it needs to
 * survive route navigation (each route re-mounts AppLock) but must reset on
 * every real reload and every time the tab is backgrounded — persisting it
 * to storage would defeat the point of a "glance" lock.
 */
let unlocked = false;

export function isSessionUnlocked(): boolean {
  return unlocked;
}

export function markSessionUnlocked(): void {
  unlocked = true;
}

export function markSessionLocked(): void {
  unlocked = false;
}
