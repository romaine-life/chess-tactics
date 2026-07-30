'use strict';

// Revision-keyed memo for derived read manifests (ADR-0256).
//
// A derived manifest (e.g. the thumbnail_urls block of a workspace response) is a
// pure function of revision-tracked inputs: the owning document's revision plus a
// caller-assembled inputs key covering every catalog/renderer revision that can
// change the answer. Reads consult the memo; derivation runs only when a revision
// actually moved.
//
// Validity semantics are asymmetric on purpose:
// - Same document revision, different inputs key: the level set is identical and
//   retained URLs are content-addressed, so the previous value is served
//   immediately while ONE background computation refreshes it (stale-while-
//   revalidate). A compute failure keeps the retained value; the next read
//   retries.
// - Different document revision (or nothing retained): the reader awaits one
//   single-flight computation. Serving a manifest from a different level set than
//   the document beside it is never acceptable.
// - compute resolves { value, settled }. An unsettled result (e.g. a manifest
//   with gaps because a render failed) is retained and served, but every later
//   read schedules a background retry until a settled result replaces it.

function createRevisionMemo({ maxEntries = 64, onBackgroundError = () => {} } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError('revision memo maxEntries must be a positive integer');
  }
  if (typeof onBackgroundError !== 'function') {
    throw new TypeError('revision memo onBackgroundError must be a function');
  }
  const entries = new Map();
  const inFlight = new Map();

  const retain = (key, docRevision, inputsKey, result) => {
    entries.delete(key);
    entries.set(key, {
      docRevision,
      inputsKey,
      value: result.value,
      settled: result.settled !== false,
    });
    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  };

  const touch = (key, entry) => {
    entries.delete(key);
    entries.set(key, entry);
  };

  const beginCompute = (key, docRevision, inputsKey, compute) => {
    const active = inFlight.get(key);
    if (active && active.docRevision === docRevision && active.inputsKey === inputsKey) {
      return active.promise;
    }
    const promise = Promise.resolve()
      .then(compute)
      .then((result) => {
        if (!result || typeof result !== 'object' || !('value' in result)) {
          throw new TypeError('revision memo compute must resolve an object with a value');
        }
        retain(key, docRevision, inputsKey, result);
        return result.value;
      })
      .finally(() => {
        if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
      });
    inFlight.set(key, { docRevision, inputsKey, promise });
    return promise;
  };

  return {
    async read({ key, docRevision, inputsKey, compute }) {
      if (typeof key !== 'string' || !key) throw new TypeError('revision memo key must be a non-empty string');
      if (typeof docRevision !== 'string' || !docRevision) throw new TypeError('revision memo docRevision must be a non-empty string');
      if (typeof inputsKey !== 'string' || !inputsKey) throw new TypeError('revision memo inputsKey must be a non-empty string');
      if (typeof compute !== 'function') throw new TypeError('revision memo compute must be a function');
      const entry = entries.get(key);
      if (entry && entry.docRevision === docRevision && entry.inputsKey === inputsKey && entry.settled) {
        touch(key, entry);
        return { value: entry.value, source: 'memo' };
      }
      if (entry && entry.docRevision === docRevision) {
        touch(key, entry);
        beginCompute(key, docRevision, inputsKey, compute)
          .catch((error) => onBackgroundError(error, key));
        return { value: entry.value, source: 'stale-while-revalidate' };
      }
      const value = await beginCompute(key, docRevision, inputsKey, compute);
      return { value, source: 'computed' };
    },
    peek(key) {
      const entry = entries.get(key);
      return entry ? { ...entry } : null;
    },
    size() {
      return entries.size;
    },
  };
}

module.exports = { createRevisionMemo };
