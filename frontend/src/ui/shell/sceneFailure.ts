// A failed scene reaches the director as a bare Error, and the director then has to guess what
// would fix it. The screen that failed usually knows: an editor document behind a private URL is
// not "artwork could not be reached", it is a missing account session, and offering Retry for it
// is an action that cannot succeed however many times it is pressed (ADR-0547).
//
// So the remedy travels ON the error rather than being re-derived from its wording. A screen that
// knows tags it; a screen that does not leaves it untagged and the director falls back to the
// session owner, which is the only other thing entitled to an opinion about identity (ADR-0306).

/** What the screen that failed believes would actually change the outcome. */
export type SceneFailureRemedy = 'sign-in' | 'retry';

const REMEDY_KEY = '__ctSceneFailureRemedy';

type TaggedError = Error & { [REMEDY_KEY]?: SceneFailureRemedy };

/** Build a scene-failure error that names its own remedy. */
export function sceneFailureError(message: string, remedy: SceneFailureRemedy): Error {
  const error: TaggedError = new Error(message);
  error[REMEDY_KEY] = remedy;
  return error;
}

/** The remedy a failing screen declared, or null when it did not declare one. */
export function sceneFailureRemedy(error: Error | null | undefined): SceneFailureRemedy | null {
  const remedy = (error as TaggedError | null | undefined)?.[REMEDY_KEY];
  return remedy === 'sign-in' || remedy === 'retry' ? remedy : null;
}

/** One re-read of the session owner, as the failure screen sees it. */
export interface SceneFailureProbe {
  /** Whether THIS probe reached the backend at all. */
  reachable: boolean;
  /** `authSessionIdentityKey` of this probe's result. */
  identityKey: string;
}

export interface SceneFailureRecovery {
  /** True when this probe means the scene is worth retrying on its own. */
  observe: (probe: SceneFailureProbe) => boolean;
}

/**
 * Decides whether a re-read of the session owner is grounds to retry a failed scene by itself.
 *
 * Retrying on every probe would spin a genuinely broken scene forever on the probe beat, and
 * retrying on none of them leaves a dead end after a dev-server restart. So a probe only earns a
 * retry when it says something MATERIALLY better than the state the scene failed under:
 *
 * - a backend that had stopped answering is answering again — the restart case, where the account
 *   never changed and the identity key alone would report nothing at all; or
 * - the identity moved: signed in here or in another tab, expired, or a different account.
 *
 * Same backend, same account, same failure ⇒ no automatic retry, and the manual action stands.
 */
export function createSceneFailureRecovery(failedUnder: string): SceneFailureRecovery {
  let backendWasUnreachable = false;
  return {
    observe: (probe) => {
      if (!probe.reachable) {
        backendWasUnreachable = true;
        return false;
      }
      return backendWasUnreachable || probe.identityKey !== failedUnder;
    },
  };
}
