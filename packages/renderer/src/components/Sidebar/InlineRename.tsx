import { useEffect, useRef, useState } from 'react';

interface InlineRenameProps {
  initial: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}

export function InlineRename({
  initial,
  onCommit,
  onCancel,
}: InlineRenameProps) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const next = value.trim();
          if (!next) onCancel();
          else onCommit(next);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
      onBlur={() => {
        const next = value.trim();
        if (!next || next === initial) onCancel();
        else onCommit(next);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 rounded-sm bg-[var(--vela-bg-app)] px-1 py-0.5 text-[13px] text-[var(--vela-fg)] outline-none ring-1 ring-[var(--vela-accent)]"
    />
  );
}
