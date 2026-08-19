# 0096 — El visualizador de recursos cubre todos los procesos, no solo las pestañas

Fecha: 2026-08-19
Estado: aceptado

## Contexto

El visualizador de recursos (`vela://` modal, Fase 5.0) recorría los nodos
`kind === 'tab'` del árbol del perfil activo y, para cada uno, buscaba su PID en
`app.getAppMetrics()`. El total mostrado en la cabecera era la suma de esas
filas.

Ese recorrido deja fuera todo lo que no es una pestaña del árbol del perfil
actual: el proceso principal, el de GPU, los procesos utility, el renderer de la
propia shell, los popups (`BrowserWindow` de menús, filepicker, vault…), las
páginas de extensión, las pestañas blindadas —que por diseño no se persisten en
`tree_nodes`— y las pestañas de otros perfiles o de otras ventanas.

El caso que lo destapó: una instalación con 16 procesos y 11,6 GB de working set
según el Administrador de tareas, donde el visualizador reportaba 162,5 MB. El
proceso responsable —un renderer de 10,7 GB creciendo— no aparecía en ninguna
fila, y como la lista se ordena por memoria descendente, su ausencia no era
atribuible al scroll.

Además había dos problemas menores que confundían la lectura:

- El total se calculaba sumando filas. Cuando varias pestañas comparten un mismo
  renderer, ese proceso se contaba una vez por pestaña.
- Una pestaña suspendida y una pestaña cuyo PID no aparece en las métricas se
  pintaban igual, ambas como `0 MB`.

La agrupación del Administrador de tareas de Windows no es una alternativa: es
una heurística sin API pública, y el AppUserModelID —lo único que la aplicación
controla— ya se establece y se hereda correctamente en los procesos hijo
(`--app-user-model-id=com.vela.browser`).

## Decisión

`RESOURCES_GET_ALL` deja de devolver `TabResource[]` y devuelve un
`ResourcesSnapshot` con cuatro campos: `tabs`, `otherProcesses`,
`totalMemoryRss` y `processCount`.

El handler recorre `app.getAppMetrics()` entero. Todo proceso que ninguna fila
de pestaña haya reclamado entra en `otherProcesses`, con un nombre legible
resuelto en main:

- `Browser` → "Proceso principal"; `GPU` → "GPU"; `Utility` → su `name` o
  `serviceName`.
- Los renderers se cruzan con `webContents.getAllWebContents()` agrupado por
  PID, lo que permite distinguir extensión (`chrome-extension://`), página
  interna (`vela://`), ventana de Vela y contenido web con su título. Un
  renderer sin `WebContents` asociado se etiqueta como tal en lugar de omitirse.

`totalMemoryRss` se acumula por proceso durante ese mismo recorrido, nunca
sumando filas. El desglose "Pestañas / Otros procesos" de la cabecera suma las
pestañas deduplicando por PID por la misma razón.

`TabResource` gana `memoryKnown`. Es `true` para una pestaña suspendida —cuyo
`0 MB` es el valor real— y `false` cuando la pestaña tiene proceso vivo pero su
PID no está en las métricas; la UI pinta "Suspendida" y "—" respectivamente.

## Consecuencias

- El total del visualizador es ahora comparable con el que da el sistema
  operativo, que era el objetivo: `Get-Process Vela | Measure-Object
  WorkingSet64 -Sum` debe cuadrar con la cabecera.
- `otherProcesses` incluye procesos de otros perfiles abiertos. Es deliberado:
  el consumo de la aplicación no se reparte por perfil y ocultarlos reproduciría
  el agujero que este ADR cierra.
- Se depende de `webContents.getAllWebContents()` únicamente para etiquetar. Si
  un renderer no se puede describir, se lista igual con su PID y su memoria: la
  cobertura no depende de que el nombre se resuelva.
- El coste por refresco (cada 2 s mientras el modal está abierto) sube en un
  recorrido de los `WebContents` vivos. Es O(n) sobre decenas de elementos y
  solo ocurre con el modal abierto.
