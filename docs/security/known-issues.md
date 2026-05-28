# Vulnerabilidades conocidas y evaluadas

Este fichero documenta las vulnerabilidades detectadas por `pnpm audit` que
se han evaluado y aceptado de forma consciente. Se actualiza en cada release.

Última evaluación: 2026-05-14 (v0.6.0-rc).

---

## Moderate — esbuild (GHSA-67mh-4wv8-2f99)

**Paquete afectado:** `esbuild@0.21.5` (transitivo vía `vite@5.4.21`)  
**Descripción:** El dev server de esbuild permite a cualquier sitio web enviar
peticiones arbitrarias y leer la respuesta (CORS bypass).  
**Fix upstream:** `esbuild >= 0.25.0`, disponible en Vite 6+.

**Evaluación de riesgo para Vela:**
- **No explotable en producción.** El binario de Electron empaquetado no
  arranca ningún servidor de desarrollo. esbuild solo se ejecuta durante
  `pnpm dev` o `pnpm build` en la máquina del desarrollador.
- La vulnerabilidad requiere que un sitio web malicioso llegue al dev server,
  que solo escucha en `localhost`. Un atacante necesitaría acceso a la máquina
  del desarrollador para explotarla.
- **Riesgo aceptado hasta migración a Vite 6.** La migración a Vite 6 se hará
  cuando sea necesaria por otras razones (p.ej. compatibilidad con Electron 43+).
  Ver `docs/decisions/` para contexto.

---

## Moderate — vite (GHSA-4w7w-66w2-5vf9)

**Paquete afectado:** `vite@5.4.21`  
**Descripción:** Path traversal en el manejo de ficheros `.map` de deps
optimizados. Permite servir ficheros fuera del directorio raíz cuando el
dev server está activo.  
**Fix upstream:** `>= 6.4.2` (solo rama 6; la rama 5 no recibirá backport).

**Evaluación de riesgo para Vela:**
- **No explotable en producción.** Solo afecta al dev server de Vite.
  El build empaquetado no incluye ni arranca Vite.
- Requiere acceso al dev server (`localhost`), que solo corre en la
  máquina del desarrollador durante el desarrollo.
- **Riesgo aceptado hasta migración a Vite 6** (mismo criterio que GHSA-67mh-4wv8-2f99).

---

## Acción pendiente

- [ ] Migrar a Vite 6 cuando el ecosistema de plugins (especialmente
      `@vitejs/plugin-react`) sea estable en la rama 6.
- [ ] Evaluar de nuevo con `pnpm audit` tras la migración.
