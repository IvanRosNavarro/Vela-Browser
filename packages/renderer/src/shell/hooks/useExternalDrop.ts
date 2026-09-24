import { useCallback, useRef, useState } from 'react';
import { toast } from '../../stores/toastStore';

/**
 * Arrastrar y soltar desde fuera de Vela sobre la chrome (sidebar y barra de
 * título): enlaces, ficheros del explorador o texto seleccionado de otra
 * aplicación. Cada cosa acaba en una pestaña; lo que Vela no sabe pintar lo
 * abre el sistema. La decisión de qué es cada cosa la toma main
 * (`droppedItems.ts`), aquí solo se recoge.
 *
 * El área de contenido queda fuera a propósito: ahí manda la página, para no
 * quitarle a las webs su propio arrastrar y soltar (subir un adjunto, por
 * ejemplo).
 */

/** A partir de aquí se pregunta antes de abrir, como hace «restaurar sesión». */
const CONFIRM_THRESHOLD = 15;

export interface DroppedItem {
  kind: 'url' | 'file' | 'text';
  value: string;
}

/** ¿Trae este arrastre algo que sepamos abrir? */
function carriesSomething(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types).some(
    (t) => t === 'Files' || t === 'text/uri-list' || t === 'text/plain',
  );
}

export function collectDropped(dt: DataTransfer): DroppedItem[] {
  const items: DroppedItem[] = [];

  for (const file of Array.from(dt.files ?? [])) {
    const path = window.api.dnd.pathForFile(file);
    if (path) items.push({ kind: 'file', value: path });
  }

  // `text/uri-list` es el formato estándar de un enlace arrastrado: una URL por
  // línea, y las que empiezan por # son comentarios.
  const uriList = dt.getData('text/uri-list');
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) items.push({ kind: 'url', value: trimmed });
    }
  }

  // El texto solo se mira si no vino ni fichero ni enlace: al arrastrar un
  // enlace, el navegador de origen suele mandar los dos y abriríamos dos veces.
  if (items.length === 0) {
    const text = dt.getData('text/plain').trim();
    if (text) items.push({ kind: 'text', value: text });
  }

  return items;
}

export interface UseExternalDropResult {
  /** true mientras hay algo soltable encima: para pintar el resaltado. */
  isOver: boolean;
  /** Props a repartir sobre el contenedor que acepta el drop. */
  dropProps: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

/**
 * @param parentIdFor devuelve la carpeta donde cae el drop, si el contenedor
 *   sabe distinguirla. Sin ella, las pestañas nacen en la raíz del workspace.
 */
export function useExternalDrop(
  parentIdFor?: (e: React.DragEvent) => string | null,
): UseExternalDropResult {
  const [isOver, setIsOver] = useState(false);
  // dragenter/dragleave rebotan al pasar por cada hijo: se cuentan las entradas
  // en vez de encender y apagar el resaltado en cada rebote.
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setIsOver(false);
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!carriesSomething(e.dataTransfer)) return;
    e.preventDefault();
    depth.current += 1;
    if (depth.current === 1) setIsOver(true);
  }, []);

  // Sin estado aquí: `dragover` se dispara cada pocos ms mientras el cursor se
  // mueve, y tocar el estado en cada uno repintaría la shell decenas de veces
  // por segundo durante el arrastre.
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!carriesSomething(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!carriesSomething(e.dataTransfer)) return;
    depth.current -= 1;
    if (depth.current <= 0) reset();
  }, [reset]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!carriesSomething(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      reset();

      const items = collectDropped(e.dataTransfer);
      if (items.length === 0) return;

      if (items.length > CONFIRM_THRESHOLD) {
        // eslint-disable-next-line no-alert
        if (!confirm(`¿Abrir ${items.length} pestañas?`)) return;
      }

      const parentId = parentIdFor ? parentIdFor(e) : null;
      void window.api.dnd.openDropped({ items, parentId }).then((res) => {
        if (!res.ok) {
          toast('No se ha podido abrir lo que has soltado', 'error');
          return;
        }
        const { system } = res.data;
        if (system > 0) {
          toast(
            system === 1
              ? 'Un archivo se ha abierto con la aplicación del sistema'
              : `${system} archivos se han abierto con sus aplicaciones`,
          );
        }
      });
    },
    [parentIdFor, reset],
  );

  return { isOver, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
