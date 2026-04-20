const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY = 8;

const sessions = new Map();

function now() {
  return Date.now();
}

export function getSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (now() - s.updatedAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return s;
}

export function appendTurn(sessionId, turn) {
  const existing = getSession(sessionId) || { history: [], lastContext: null, createdAt: now() };
  existing.history = [...existing.history, turn].slice(-MAX_HISTORY);
  if (turn.context) existing.lastContext = turn.context;
  existing.updatedAt = now();
  sessions.set(sessionId, existing);
  return existing;
}

export function getRecentHistory(sessionId, n = 3) {
  const s = getSession(sessionId);
  if (!s) return [];
  return s.history.slice(-n);
}

export function getLastContext(sessionId) {
  const s = getSession(sessionId);
  return s?.lastContext || null;
}

setInterval(() => {
  const cutoff = now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) {
    if (s.updatedAt < cutoff) sessions.delete(id);
  }
}, 5 * 60 * 1000).unref?.();
