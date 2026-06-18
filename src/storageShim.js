// Minimal localStorage-backed replacement for the Claude.ai Artifacts
// `window.storage` API. Matches the same async signature so the rest of
// App.jsx (get/set/delete calls) doesn't need to change at every call site.
//
// Claude.ai's real window.storage supports a `shared` flag for data visible
// across users; that concept doesn't apply to a single-browser localStorage
// app, so `shared` is accepted but ignored here.

const PREFIX = 'the-deeping:';

function ok(key, value) {
  return { key, value, shared: false };
}

export function installLocalStorageShim() {
  if (typeof window === 'undefined') return;
  if (window.storage) return; // don't override a real implementation if present

  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) {
        // The real API throws/rejects on a missing key rather than returning null.
        throw new Error(`Key not found: ${key}`);
      }
      return ok(key, raw);
    },

    async set(key, value) {
      localStorage.setItem(PREFIX + key, value);
      return ok(key, value);
    },

    async delete(key) {
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: true, shared: false };
    },

    async list(prefix) {
      const keys = [];
      const fullPrefix = PREFIX + (prefix || '');
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) keys.push(k.slice(PREFIX.length));
      }
      return { keys, prefix, shared: false };
    },
  };
}
