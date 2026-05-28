let getToolsRect: (() => DOMRect | null) | null = null;
let getStatusRect: (() => DOMRect | null) | null = null;

export const clusterRegistry = {
  registerTools: (fn: () => DOMRect | null) => { getToolsRect = fn; },
  registerStatus: (fn: () => DOMRect | null) => { getStatusRect = fn; },
  unregisterTools: () => { getToolsRect = null; },
  unregisterStatus: () => { getStatusRect = null; },
  getToolsRect: () => getToolsRect?.() ?? null,
  getStatusRect: () => getStatusRect?.() ?? null,
};
