export interface TabResource {
  tabId: string;
  title: string;
  favicon: string | null;
  workspaceName: string;
  workspaceColor: string | null;
  status: 'active' | 'discarded' | 'loading' | 'error';
  memoryRss: number;     // KB (residentSet)
  memoryShared: number;  // KB
  pid: number | null;
  url: string;
  /**
   * `false` cuando la pestaña tiene un proceso vivo pero su PID no aparece en
   * `app.getAppMetrics()`. Distingue "no consume" de "no he podido medirlo":
   * sin esto ambos casos se pintaban como `0 MB`.
   */
  memoryKnown: boolean;
}

export type SystemProcessKind = 'browser' | 'gpu' | 'utility' | 'renderer' | 'other';

/**
 * Proceso de la aplicación que no corresponde a ninguna pestaña del árbol del
 * perfil actual: el proceso principal, la GPU, los utility, el renderer de la
 * propia shell, popups, extensiones, pestañas blindadas y pestañas de otros
 * perfiles o ventanas.
 */
export interface SystemProcessResource {
  pid: number;
  kind: SystemProcessKind;
  /** Etiqueta legible ya resuelta en main. */
  name: string;
  /** Detalle secundario (URL, nombre de servicio…), si se ha podido deducir. */
  detail: string | null;
  memoryRss: number; // KB
}

export interface ResourcesSnapshot {
  /** Pestañas del árbol del perfil actual. */
  tabs: TabResource[];
  /** Todo lo demás. Ordenado por memoria descendente. */
  otherProcesses: SystemProcessResource[];
  /**
   * Suma de TODOS los procesos de la aplicación (`app.getAppMetrics()`), en KB.
   * Se calcula por proceso, no sumando filas: varias pestañas pueden compartir
   * un mismo renderer y sumar sus filas contaría ese proceso varias veces.
   */
  totalMemoryRss: number;
  /** Número total de procesos de la aplicación. */
  processCount: number;
}
