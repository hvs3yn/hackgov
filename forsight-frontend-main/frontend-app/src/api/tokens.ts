/*
 * JWT storage. "Remember me" keeps the tokens in localStorage, otherwise they
 * live in sessionStorage (this tab only). An in-memory copy keeps the app
 * working when both stores are blocked.
 */

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const KEY = "foresight.tokens";

let memory: Tokens | null = null;

function stores(): Storage[] {
  const out: Storage[] = [];
  try {
    out.push(window.localStorage);
  } catch {
    /* blocked */
  }
  try {
    out.push(window.sessionStorage);
  } catch {
    /* blocked */
  }
  return out;
}

export function loadTokens(): Tokens | null {
  if (memory) return memory;
  for (const store of stores()) {
    try {
      const raw = store.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Tokens;
        if (parsed.accessToken && parsed.refreshToken) {
          memory = parsed;
          return parsed;
        }
      }
    } catch {
      /* unreadable or corrupt: ignore */
    }
  }
  return null;
}

export function clearTokens() {
  memory = null;
  for (const store of stores()) {
    try {
      store.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

export function saveTokens(tokens: Tokens, remember: boolean) {
  clearTokens();
  memory = tokens;
  try {
    (remember ? window.localStorage : window.sessionStorage).setItem(KEY, JSON.stringify(tokens));
  } catch {
    /* storage unavailable: tokens last until reload */
  }
}

/** Replaces rotated tokens in whichever store already holds them. */
export function rotateTokens(tokens: Tokens) {
  memory = tokens;
  for (const store of stores()) {
    try {
      if (store.getItem(KEY)) store.setItem(KEY, JSON.stringify(tokens));
    } catch {
      /* ignore */
    }
  }
}
