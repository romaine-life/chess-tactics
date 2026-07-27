'use strict';

async function prepareGenerationAttemptArchiveThumbnail(result, authorityKey, ensureDerivative) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('generation-attempt archive result is required');
  }
  if (typeof ensureDerivative !== 'function') {
    throw new TypeError('thumbnail derivative function is required');
  }
  if (!result.canonicalThumbnailRequiresEnsure || !result.canonicalLevel) {
    return Object.freeze({ attempted: false, ready: true, error: null });
  }
  try {
    await ensureDerivative(authorityKey, result.canonicalLevel);
    return Object.freeze({ attempted: true, ready: true, error: null });
  } catch (error) {
    return Object.freeze({ attempted: true, ready: false, error });
  }
}

module.exports = { prepareGenerationAttemptArchiveThumbnail };
