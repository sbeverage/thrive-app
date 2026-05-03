import { createContext, useContext } from 'react';

/**
 * Tour was removed; this module stays so stale Metro bundles that still import
 * `useTutorialReplay` do not crash. New code should not use it.
 */
export const TutorialReplayContext = createContext(null);

export function useTutorialReplay() {
  return useContext(TutorialReplayContext);
}
