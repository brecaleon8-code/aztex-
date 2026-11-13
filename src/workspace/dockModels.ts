import type { Model } from 'flexlayout-react';

/**
 * The live flexlayout models of mounted workspaces, so store actions (add window, maximize…) can
 * act on the mounted dock directly instead of rebuilding it from JSON.
 */
const models = new Map<string, Model>();

export const dockModels = {
  set: (workspaceId: string, m: Model) => void models.set(workspaceId, m),
  delete: (workspaceId: string, m: Model) => {
    if (models.get(workspaceId) === m) models.delete(workspaceId);
  },
  get: (workspaceId: string) => models.get(workspaceId),
};
