/**
 * Client-side interface preferences for the Settings page.
 *
 * These are genuine, wired controls — not cosmetic stubs. Each value is
 * persisted to localStorage and applied to <html> as a data-* attribute that
 * the stylesheet (production-ui.css) reacts to, so a change takes effect
 * immediately and survives a reload. Server state is unaffected.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type MotionPreference = 'full' | 'reduced';

export interface InterfacePreferences {
  theme: ThemePreference;
  motion: MotionPreference;
}

const STORAGE_KEY = 'agentmesh.ui.preferences';

const DEFAULTS: InterfacePreferences = {
  theme: 'system',
  motion: 'full',
};

const listeners = new Set<(prefs: InterfacePreferences) => void>();
let current: InterfacePreferences = DEFAULTS;

function read(): InterfacePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<InterfacePreferences>;
    return {
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system',
      motion: parsed.motion === 'reduced' ? 'reduced' : 'full',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function apply(prefs: InterfacePreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // Theme: when 'system', remove the override so prefers-color-scheme wins.
  if (prefs.theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', prefs.theme);
  }
  // Motion: 'reduced' disables transitions/animations app-wide.
  if (prefs.motion === 'reduced') {
    root.setAttribute('data-motion', 'reduced');
  } else {
    root.removeAttribute('data-motion');
  }
}

/** Read + apply the persisted preferences. Call once at app boot. */
export function initPreferences(): InterfacePreferences {
  current = read();
  apply(current);
  return current;
}

export function getPreferences(): InterfacePreferences {
  return current;
}

export function setPreferences(patch: Partial<InterfacePreferences>): InterfacePreferences {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* ignore storage failures */
  }
  apply(current);
  listeners.forEach((listener) => listener(current));
  return current;
}

export function subscribePreferences(listener: (prefs: InterfacePreferences) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Apply immediately on module load so there is no flash before React mounts.
initPreferences();
