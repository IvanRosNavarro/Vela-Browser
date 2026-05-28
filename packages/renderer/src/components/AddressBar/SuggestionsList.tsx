import { useEffect, useRef } from 'react';
import type { ExtendedSuggestion } from './useAddressBar';
import { useRuntimeStore } from '../../stores/runtimeStore';

interface SuggestionsListProps {
  suggestions: ExtendedSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: ExtendedSuggestion, newTab: boolean) => void;
  onHoverIndex: (index: number) => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

export function SuggestionsList({
  suggestions,
  selectedIndex,
  anchorRef,
}: SuggestionsListProps) {
  const windowId = useRuntimeStore((s) => s.currentWindowId);
  const hasItems = suggestions.length > 0;
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!windowId) return;

    if (!hasItems) {
      if (wasOpenRef.current) {
        void window.api.suggestionsPopup.close({ windowId });
        wasOpenRef.current = false;
      }
      return;
    }

    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      void window.api.suggestionsPopup.open({
        windowId,
        anchorRect: { left: rect.left, bottom: rect.bottom, width: rect.width },
        suggestions,
        selectedIndex,
      });
    } else {
      void window.api.suggestionsPopup.update({ windowId, suggestions, selectedIndex });
    }
  }, [suggestions, selectedIndex, hasItems, windowId, anchorRef]);

  useEffect(() => {
    return () => {
      if (windowId && wasOpenRef.current) {
        void window.api.suggestionsPopup.close({ windowId });
        wasOpenRef.current = false;
      }
    };
  }, [windowId]);

  return null;
}
