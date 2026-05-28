import {
  forwardRef,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import type { FormattedUrl } from './url';

interface UrlInputProps {
  editing: boolean;
  inputValue: string;
  display: FormattedUrl;
  placeholder?: string;
  compact: boolean;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onActivateDisplay: () => void;
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--vela-addressbar-fg)',
  fontSize: 13,
  padding: 0,
};

export const UrlInput = forwardRef<HTMLInputElement, UrlInputProps>(
  function UrlInput(props, ref) {
    const {
      editing,
      inputValue,
      display,
      placeholder,
      compact,
      onChange,
      onKeyDown,
      onFocus,
      onBlur,
      onActivateDisplay,
    } = props;

    if (editing) {
      return (
        <input
          ref={ref}
          type="text"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          value={inputValue}
          placeholder={placeholder}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value)
          }
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          style={{
            ...inputStyle,
            fontSize: compact ? 12 : 13,
          }}
          aria-label="Barra de direcciones"
        />
      );
    }

    const isEmpty = display.domain.length === 0 && display.rest.length === 0;
    return (
      <div
        role="textbox"
        aria-label="Barra de direcciones"
        tabIndex={0}
        onClick={onActivateDisplay}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivateDisplay();
          }
        }}
        title={display.raw}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          cursor: 'text',
          fontSize: compact ? 12 : 13,
          overflow: 'hidden',
        }}
      >
        {isEmpty ? (
          <span style={{ color: 'var(--vela-addressbar-fg-muted)' }}>
            {placeholder ?? 'Buscar o escribir una dirección'}
          </span>
        ) : (
          <span
            style={{
              display: 'block',
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ color: 'var(--vela-addressbar-fg)' }}>
              {display.domain}
            </span>
            {display.rest ? (
              <span style={{ color: 'var(--vela-addressbar-fg-muted)' }}>
                {display.rest}
              </span>
            ) : null}
          </span>
        )}
      </div>
    );
  },
);
