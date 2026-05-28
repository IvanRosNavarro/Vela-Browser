import type { ReactNode } from 'react';

interface Props {
  label: string;
  description?: string;
  children: ReactNode;
}

export function SettingRow({ label, description, children }: Props) {
  return (
    <div className="flex items-center justify-between gap-8 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--vela-fg)]">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-[var(--vela-fg-muted)]">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

export function SettingSection({ title, children }: SectionProps) {
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">
        {title}
      </h2>
      <div className="divide-y divide-[var(--vela-border)] overflow-hidden rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)]">
        {children}
      </div>
    </div>
  );
}
