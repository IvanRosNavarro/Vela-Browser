import { useCallback } from 'react';
import { useScreenshotStore } from '../../../stores/screenshotStore';
import { toast } from '../../../stores/toastStore';

export function useScreenshot() {
  const captureVisible = useCallback(async () => {
    // Use the pre-captured snapshot (taken before the overlay hid the WCV).
    // If we call capturePage() here the WCV is already at HIDDEN_BOUNDS (1×1 px).
    const { backgroundSnapshot } = useScreenshotStore.getState();
    if (backgroundSnapshot) {
      useScreenshotStore.getState().openEditor(backgroundSnapshot);
      return;
    }
    // Fallback: no pre-capture available, try IPC (may yield tiny image if WCV hidden)
    const res = await window.api.screenshot.captureVisible();
    if (!res.ok) {
      toast('Error al capturar la pantalla', 'error');
      useScreenshotStore.getState().close();
      return;
    }
    useScreenshotStore.getState().openEditor(res.data.dataUrl);
  }, []);

  const captureRegion = useCallback(
    async (region: { x: number; y: number; width: number; height: number }) => {
      const res = await window.api.screenshot.captureRegion(region);
      if (!res.ok) {
        toast('Error al capturar la región', 'error');
        useScreenshotStore.getState().close();
        return;
      }
      useScreenshotStore.getState().openEditor(res.data.dataUrl);
    },
    [],
  );

  const captureFullPage = useCallback(async () => {
    const res = await window.api.screenshot.captureFullPage();
    if (!res.ok) {
      toast('Error al capturar la página completa', 'error');
      useScreenshotStore.getState().close();
      return;
    }
    useScreenshotStore.getState().openEditor(res.data.dataUrl);
  }, []);

  const close = useCallback(() => {
    useScreenshotStore.getState().close();
  }, []);

  return { captureVisible, captureRegion, captureFullPage, close };
}
