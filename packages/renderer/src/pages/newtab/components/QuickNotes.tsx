import { useCallback, useEffect, useRef, useState } from 'react';

const URL_REGEX = /https?:\/\/[^\s]+/g;

interface Props {
  workspaceId: string;
}

function renderWithLinks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_REGEX.source, 'g');
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href={url}
        className="text-[var(--vela-accent)] underline underline-offset-2 hover:opacity-80"
        onClick={(e) => { e.stopPropagation(); window.location.href = url; }}
      >
        {url}
      </a>,
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function QuickNotes({ workspaceId }: Props) {
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void window.api.notes.get({ workspaceId }).then((res) => {
      if (res.ok && res.data) setContent(res.data.content);
    });
  }, [workspaceId]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [content, editing]);

  const scheduleSave = useCallback(
    (value: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaving(true);
      saveTimer.current = setTimeout(() => {
        void window.api.notes.save({ workspaceId, content: value }).then(() => {
          setSaving(false);
          setSavedFlash(true);
          if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
          savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 1500);
        });
      }, 500);
    },
    [workspaceId],
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    scheduleSave(val);
  }

  function handleTextareaInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }

  const isEmpty = content.trim().length === 0;

  return (
    <div className="mt-3 border-t border-[var(--vela-border)] pt-3">
      {editing ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onInput={handleTextareaInput}
            onBlur={() => setEditing(false)}
            placeholder="Notas de este workspace..."
            rows={2}
            style={{ resize: 'none', maxHeight: '8rem', overflowY: 'auto' }}
            className="w-full bg-transparent text-xs text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] outline-none"
            autoFocus
          />
          <div className="mt-1 text-right text-[10px] text-[var(--vela-fg-muted)]">
            {saving && <span className="animate-pulse">•</span>}
            {!saving && savedFlash && <span>Guardado</span>}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setEditing(true)}
        >
          {isEmpty ? (
            <p className="text-xs text-[var(--vela-fg-muted)] italic">
              Notas de este workspace...
            </p>
          ) : (
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-[var(--vela-fg)]">
              {renderWithLinks(content)}
            </p>
          )}
        </button>
      )}
    </div>
  );
}
