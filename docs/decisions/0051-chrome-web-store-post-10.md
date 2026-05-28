# ADR 0051 — Compatibilidad completa con Chrome Web Store diferida a post-1.0

## Estado
Aceptado — diferido

## Contexto
Vela usa `electron-chrome-extensions` (ECE) para soportar extensiones
de Chrome. La instalación de extensiones desde la Chrome Web Store
(CWS) directamente (como en Chrome) requiere OAuth con Google y el
cumplimiento de requisitos legales de la Google API Services. ECE no
gestiona este flujo automáticamente.

## Decisión
La compatibilidad completa con la Chrome Web Store se difiere a post-1.0.

## Razonamiento
- La instalación desde CWS requiere un Client ID OAuth de Google
  aprobado para aplicaciones de terceros que accedan a la API de CWS.
  El proceso de aprobación es largo y tiene requisitos de privacidad.
- ECE expone `installFromCrx(path)` para instalar archivos `.crx`
  locales. Suficiente para el MVP.
- **Mejora disponible antes de 1.0** (no requiere OAuth): instalación
  de `.crx` por drag-and-drop a la ventana de Vela. El archivo `.crx`
  se descarga manualmente desde CWS y se arrastra a la ventana.

## Consecuencias
- En MVP: instalar extensiones arrastrando `.crx` a la ventana o
  desde `vela://extensions` con selector de fichero.
- Post-1.0: flujo de instalación desde CWS con OAuth, similar a
  cómo Brave gestiona las extensiones de Google.
- Al iniciar el trabajo post-1.0, evaluar si ECE añade soporte
  nativo o si requiere implementación propia del flujo OAuth.
