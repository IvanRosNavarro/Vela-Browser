import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

/**
 * Compleción inline de la barra de direcciones (como Chrome/Firefox): al
 * escribir `gi` el campo muestra `github.com/` con `thub.com/` seleccionado.
 *
 * El dueño del input guarda lo escrito (`typed`) en su propio estado; este
 * hook guarda la compleción y decide cuándo pedirla, aceptarla o quitarla.
 * Lo usan la URL bar (`useAddressBar`) y el buscador de `vela://newtab`.
 */

export interface InlineCompletion {
  /** Lo escrito por el usuario. */
  typed: string;
  /** Forma visible completa; empieza por `typed` sin distinguir mayúsculas. */
  text: string;
  /** Destino real al pulsar Enter. */
  url: string;
}

/** Ajuste de perfil que desactiva la compleción inline (activa por defecto). */
export const INLINE_AUTOCOMPLETE_SETTING = 'addressbar:inline-autocomplete' as const;

/**
 * Solo se completa lo que parece el principio de una dirección: sin espacios,
 * sin prefijo de modo (`>`, `#`, `@`, `!`) y con un host plausible antes de
 * la primera `/`, `?` o `#`. Lo demás se trata como búsqueda.
 */
export function isInlineAutocompleteCandidate(value: string): boolean {
  if (value.length === 0 || /\s/.test(value)) return false;
  if ('>#@!'.includes(value[0] ?? '')) return false;
  const rest = value.replace(/^https?:\/\//i, '');
  if (rest.length === 0) return false;
  const hostEnd = rest.search(/[/?#]/);
  const host = hostEnd === -1 ? rest : rest.slice(0, hostEnd);
  return /^[\p{L}\p{N}._\-:@[\]]+$/u.test(host);
}

/**
 * Indica si un cambio del input puede disparar la compleción: solo al teclear
 * un carácter (no al borrar, pegar ni durante una composición IME) y con el
 * cursor al final sin selección.
 */
export function canInlineComplete(e: ChangeEvent<HTMLInputElement>): boolean {
  const native = e.nativeEvent as InputEvent;
  if (native.isComposing || native.inputType !== 'insertText') return false;
  const el = e.target;
  const end = el.value.length;
  return el.selectionStart === end && el.selectionEnd === end;
}

/** Valor que debe pintar el input: lo escrito más el resto de la compleción. */
export function inlineDisplayValue(
  typed: string,
  completion: InlineCompletion | null,
): string {
  if (!completion || completion.typed !== typed) return typed;
  return typed + completion.text.slice(typed.length);
}

function startsWithIgnoreCase(text: string, prefix: string): boolean {
  return text.toLowerCase().startsWith(prefix.toLowerCase());
}

export interface InlineAutocomplete {
  /** Compleción vigente (con resto seleccionado o ya aceptada). */
  completion: InlineCompletion | null;
  /** True si hay texto completado pendiente de aceptar (seleccionado). */
  hasSuggestedSuffix: boolean;
  /**
   * Avisar de cada cambio de lo escrito por el usuario. `allowComplete` sale
   * de `canInlineComplete(e)`; con false se quita la compleción y no se pide
   * otra en esta pulsación (Backspace, Supr, pegar, IME).
   */
  onTyped: (value: string, allowComplete: boolean) => void;
  /**
   * Teclas de la compleción. Devuelve el nuevo texto escrito si la tecla la
   * acepta (→, Fin, ←, Inicio), para que el dueño actualice su estado.
   * La acción por defecto de la tecla se conserva.
   */
  acceptOnKey: (e: KeyboardEvent<HTMLInputElement>) => string | null;
  /** Quita el resto completado (Escape). Devuelve true si había algo que quitar. */
  dismiss: () => boolean;
  /** Olvida la compleción y descarta respuestas pendientes. */
  reset: () => void;
  compositionHandlers: {
    onCompositionStart: () => void;
    onCompositionEnd: () => void;
  };
}

const ACCEPT_KEYS = new Set(['ArrowRight', 'End', 'ArrowLeft', 'Home']);

export function useInlineAutocomplete(
  inputRef: RefObject<HTMLInputElement | null>,
  enabled: boolean,
): InlineAutocomplete {
  const [completion, setCompletionState] = useState<InlineCompletion | null>(null);
  const completionRef = useRef<InlineCompletion | null>(null);
  const typedRef = useRef('');
  const seqRef = useRef(0);
  const composingRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const setCompletion = useCallback((next: InlineCompletion | null) => {
    completionRef.current = next;
    setCompletionState(next);
  }, []);

  const reset = useCallback(() => {
    seqRef.current += 1;
    typedRef.current = '';
    if (completionRef.current) setCompletion(null);
  }, [setCompletion]);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  const onTyped = useCallback(
    (value: string, allowComplete: boolean) => {
      typedRef.current = value;
      const seq = ++seqRef.current;
      if (!enabledRef.current || !allowComplete || !isInlineAutocompleteCandidate(value)) {
        if (completionRef.current) setCompletion(null);
        return;
      }

      // Si lo tecleado sigue la compleción actual, se mantiene sin esperar a
      // main (no parpadea); la respuesta nueva puede afinarla.
      const prev = completionRef.current;
      if (prev && startsWithIgnoreCase(prev.text, value)) {
        setCompletion({ ...prev, typed: value });
      } else if (prev) {
        setCompletion(null);
      }

      void window.api.history
        .autocomplete({ prefix: value })
        .then((res) => {
          // Respuesta obsoleta: el usuario ya escribió, borró o salió.
          if (seq !== seqRef.current || composingRef.current) return;
          if (!res.ok || !res.data) return;
          const typed = typedRef.current;
          const { text, url } = res.data;
          if (!startsWithIgnoreCase(text, typed)) return;
          // El cursor debe seguir al final de lo escrito (con o sin el resto
          // de una compleción anterior seleccionado).
          const el = inputRef.current;
          if (!el || el.selectionStart !== typed.length || el.selectionEnd !== el.value.length) return;
          setCompletion({ typed, text, url });
        })
        .catch(() => { /* sin compleción */ });
    },
    [inputRef, setCompletion],
  );

  const acceptOnKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): string | null => {
      const c = completionRef.current;
      if (!c || c.text.length === c.typed.length) return null;
      if (!ACCEPT_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return null;
      const text = c.typed + c.text.slice(c.typed.length);
      typedRef.current = text;
      seqRef.current += 1;
      setCompletion({ typed: text, text, url: c.url });
      return text;
    },
    [setCompletion],
  );

  const dismiss = useCallback((): boolean => {
    const c = completionRef.current;
    seqRef.current += 1;
    if (!c) return false;
    setCompletion(null);
    return c.text.length > c.typed.length;
  }, [setCompletion]);

  // Selecciona el resto completado en cuanto el input pinta el valor nuevo.
  // Una compleción ya aceptada (sin resto) no toca el cursor: React vuelca el
  // estado antes de la acción por defecto de la tecla, y colocarlo al final
  // haría que ← acabara una posición antes del final en vez de donde empezaba
  // la selección.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!completion || !el || document.activeElement !== el) return;
    if (completion.text.length <= completion.typed.length) return;
    const end = el.value.length;
    if (end < completion.typed.length) return;
    el.setSelectionRange(completion.typed.length, end);
  }, [completion, inputRef]);

  const compositionHandlers = {
    onCompositionStart: useCallback(() => {
      composingRef.current = true;
    }, []),
    onCompositionEnd: useCallback(() => {
      composingRef.current = false;
    }, []),
  };

  return {
    completion,
    hasSuggestedSuffix: !!completion && completion.text.length > completion.typed.length,
    onTyped,
    acceptOnKey,
    dismiss,
    reset,
    compositionHandlers,
  };
}
