import type { DropZone } from './dropValidation';

export interface ActiveDrop {
  draggedId: string;
  targetId: string;
  zone: DropZone;
  invalid: boolean;
}
