import { protocol, type Session } from 'electron';
import { PreviewStore } from '../previews/PreviewStore';

function handlePreviewRequest(request: Request): Response | Promise<Response> {
  // URL format: vela-preview://{profileId}/{tabId}
  const url = new URL(request.url);
  const profileId = url.hostname;
  const tabId = url.pathname.slice(1); // remove leading /

  if (!profileId || !tabId) {
    return new Response(null, { status: 400 });
  }

  const store = new PreviewStore(profileId);
  return store.get(tabId).then((buffer) => {
    if (!buffer) return new Response(null, { status: 404 });
    return new Response(buffer, {
      headers: { 'Content-Type': 'image/webp' },
    });
  });
}

const registeredPreviewSessions = new WeakSet<Session>();

export function registerPreviewProtocol(): void {
  protocol.handle('vela-preview', handlePreviewRequest);
}

export function ensurePreviewProtocolOnSession(ses: Session): void {
  if (registeredPreviewSessions.has(ses)) return;
  registeredPreviewSessions.add(ses);
  ses.protocol.handle('vela-preview', handlePreviewRequest);
}
