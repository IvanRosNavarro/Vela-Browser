import { useEffect, useRef } from 'react';
import { useTabSwitcherStore } from '../../../stores/tabSwitcherStore';

export interface NavigableItem {
  type: 'tab' | 'recent';
  tabId?: string;
  closedTabId?: string;
  workspaceId?: string;
  onActivate: () => void;
}

interface UseTabSwitcherKeyboardOptions {
  flatNavigable: NavigableItem[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onCtrlEnterTab?: (tabId: string) => void;
}

export function useTabSwitcherKeyboard({
  flatNavigable,
  inputRef,
  scrollRef,
  isOpen,
  onCtrlEnterTab,
}: UseTabSwitcherKeyboardOptions): void {
  const focusedIndex = useTabSwitcherStore((s) => s.focusedIndex);
  const setFocusedIndex = useTabSwitcherStore((s) => s.setFocusedIndex);
  const close = useTabSwitcherStore((s) => s.close);
  const setQuery = useTabSwitcherStore((s) => s.setQuery);

  const flatRef = useRef(flatNavigable);
  flatRef.current = flatNavigable;
  const focusedRef = useRef(focusedIndex);
  focusedRef.current = focusedIndex;

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent): void => {
      const flat = flatRef.current;
      const current = focusedRef.current;

      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flat.length === 0) return;
        const next = (current + 1) % flat.length;
        setFocusedIndex(next);
        scrollItemIntoView(scrollRef, next);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flat.length === 0) return;
        const next = (current - 1 + flat.length) % flat.length;
        setFocusedIndex(next);
        scrollItemIntoView(scrollRef, next);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const item = flat[current];
        if (!item) return;
        if (e.ctrlKey && item.type === 'tab' && item.tabId && onCtrlEnterTab) {
          onCtrlEnterTab(item.tabId);
        } else {
          item.onActivate();
        }
        return;
      }

      // Any printable character → focus the search input
      if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        document.activeElement !== inputRef.current
      ) {
        inputRef.current?.focus();
        setQuery(e.key);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close, setFocusedIndex, setQuery, scrollRef, inputRef, onCtrlEnterTab]);
}

function scrollItemIntoView(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  index: number,
): void {
  requestAnimationFrame(() => {
    const container = scrollRef.current;
    if (!container) return;
    const item = container.querySelector(`[data-nav-index="${index}"]`);
    if (item) {
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}
