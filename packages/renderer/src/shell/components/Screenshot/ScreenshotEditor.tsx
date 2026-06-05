import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import Konva from 'konva';
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Arrow,
  Rect,
  Ellipse,
  Line,
  Text,
  Transformer,
} from 'react-konva';
import { ScreenshotToolbar, type Tool } from './ScreenshotToolbar';
import { toast } from '../../../stores/toastStore';
import { writeToClipboard } from '../../../lib/clipboard';

interface Annotation {
  id: string;
  type: Tool;
  // Arrow
  points?: number[];
  // Rect / Ellipse / Blur
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // Ellipse radii
  radiusX?: number;
  radiusY?: number;
  // Text
  text?: string;
  // Style
  color?: string;
  strokeWidth?: number;
}

let idCounter = 0;
function nextId() {
  return `ann-${++idCounter}`;
}

interface Props {
  dataUrl: string;
  onClose(): void;
}

export function ScreenshotEditor({ dataUrl, onClose }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [histIndex, setHistIndex] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [currentAnn, setCurrentAnn] = useState<Annotation | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; id: string } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Map<string, Konva.Shape>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Cargar imagen
  useEffect(() => {
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = dataUrl;
  }, [dataUrl]);

  // Transformer sobre selección
  useEffect(() => {
    if (!trRef.current) return;
    if (selectedId) {
      const node = shapeRefs.current.get(selectedId);
      if (node) {
        trRef.current.nodes([node]);
        trRef.current.getLayer()?.batchDraw();
        return;
      }
    }
    trRef.current.nodes([]);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedId]);

  const pushHistory = useCallback((anns: Annotation[]) => {
    setHistory((h) => [...h.slice(0, histIndex + 1), anns]);
    setHistIndex((i) => i + 1);
    setAnnotations(anns);
  }, [histIndex]);

  const undo = useCallback(() => {
    if (histIndex <= 0) return;
    const ni = histIndex - 1;
    setHistIndex(ni);
    setAnnotations(history[ni] ?? []);
  }, [histIndex, history]);

  const redo = useCallback(() => {
    if (histIndex >= history.length - 1) return;
    const ni = histIndex + 1;
    setHistIndex(ni);
    setAnnotations(history[ni] ?? []);
  }, [histIndex, history]);

  // Auto-focus el contenedor para que Esc y Ctrl+Z funcionen aunque el canvas de
  // Konva capture el foco durante la interacción.
  useEffect(() => {
    const id = requestAnimationFrame(() => containerRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (!isTyping && e.ctrlKey && e.key === 'c') { e.preventDefault(); void handleCopy(); }
      if (!isTyping && e.ctrlKey && e.key === 's') { e.preventDefault(); void handleSavePng(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, onClose]);

  // --- Dibujo ---

  const onStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<globalThis.MouseEvent>) => {
      if (tool === 'select') {
        const clicked = e.target;
        if (clicked === e.target.getStage()) setSelectedId(null);
        return;
      }
      if (tool === 'text') return;

      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      const ann: Annotation = {
        id: nextId(),
        type: tool,
        color,
        strokeWidth,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
      };

      if (tool === 'arrow' || tool === 'line') {
        ann.points = [pos.x, pos.y, pos.x, pos.y];
      } else if (tool === 'ellipse') {
        ann.radiusX = 0;
        ann.radiusY = 0;
      }

      setCurrentAnn(ann);
      setDrawing(true);
    },
    [tool, color, strokeWidth],
  );

  const onStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<globalThis.MouseEvent>) => {
      if (!drawing || !currentAnn) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      const startX = currentAnn.x ?? 0;
      const startY = currentAnn.y ?? 0;

      if (currentAnn.type === 'arrow' || currentAnn.type === 'line') {
        setCurrentAnn({ ...currentAnn, points: [startX, startY, pos.x, pos.y] });
      } else if (currentAnn.type === 'ellipse') {
        setCurrentAnn({
          ...currentAnn,
          radiusX: Math.abs(pos.x - startX) / 2,
          radiusY: Math.abs(pos.y - startY) / 2,
          x: (startX + pos.x) / 2,
          y: (startY + pos.y) / 2,
        });
      } else {
        setCurrentAnn({
          ...currentAnn,
          width: pos.x - startX,
          height: pos.y - startY,
        });
      }
    },
    [drawing, currentAnn],
  );

  const onStageMouseUp = useCallback(() => {
    if (!drawing || !currentAnn) return;
    setDrawing(false);
    const finalAnns = [...annotations, currentAnn];
    pushHistory(finalAnns);
    setCurrentAnn(null);
  }, [drawing, currentAnn, annotations, pushHistory]);

  const onStageClick = useCallback(
    (e: Konva.KonvaEventObject<globalThis.MouseEvent>) => {
      if (tool !== 'text') return;
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      const id = nextId();
      setTextInput({ x: pos.x, y: pos.y, id });
      setTextValue('');
    },
    [tool],
  );

  const commitText = useCallback(() => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null);
      setTextValue('');
      return;
    }
    const ann: Annotation = {
      id: textInput.id,
      type: 'text',
      x: textInput.x,
      y: textInput.y,
      text: textValue,
      color,
      strokeWidth,
    };
    const finalAnns = [...annotations, ann];
    pushHistory(finalAnns);
    setTextInput(null);
    setTextValue('');
  }, [textInput, textValue, annotations, pushHistory, color, strokeWidth]);

  const onTextKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitText();
      if (e.key === 'Escape') { setTextInput(null); setTextValue(''); }
    },
    [commitText],
  );

  // --- Pixel-blur helper ---

  function buildBlurredImage(ann: Annotation): HTMLCanvasElement | null {
    if (!img || ann.width === undefined || ann.height === undefined) return null;
    const { x = 0, y = 0, width, height } = ann;
    const w = Math.abs(width);
    const h = Math.abs(height);
    const ox = width < 0 ? x + width : x;
    const oy = height < 0 ? y + height : y;
    const SCALE = 8;
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.floor(w / SCALE));
    small.height = Math.max(1, Math.floor(h / SCALE));
    const ctx2 = small.getContext('2d');
    if (!ctx2) return null;
    ctx2.drawImage(img, ox, oy, w, h, 0, 0, small.width, small.height);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx3 = out.getContext('2d');
    if (!ctx3) return null;
    ctx3.imageSmoothingEnabled = false;
    ctx3.drawImage(small, 0, 0, w, h);
    return out;
  }

  // --- Acciones finales ---

  const getExportDataUrl = useCallback((): string | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    return stage.toDataURL({ pixelRatio: 2 });
  }, []);

  const handleCopy = useCallback(async () => {
    const url = getExportDataUrl();
    if (!url) return;
    const res = await window.api.screenshot.copyImage(url);
    if (res.ok) toast('Imagen copiada al portapapeles', 'info');
    else toast('Error al copiar', 'error');
    onClose();
  }, [getExportDataUrl, onClose]);

  const handleSavePng = useCallback(async () => {
    const url = getExportDataUrl();
    if (!url) return;
    const res = await window.api.screenshot.saveFile({ dataUrl: url, format: 'png' });
    if (res.ok && res.data.saved) { toast('PNG guardado', 'info'); onClose(); }
    else if (res.ok && !res.data.saved) { /* cancelado — no cerrar */ }
    else { toast('Error al guardar', 'error'); onClose(); }
  }, [getExportDataUrl, onClose]);

  const handleSaveJpeg = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;
    const url = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/jpeg', quality: 0.9 });
    const res = await window.api.screenshot.saveFile({ dataUrl: url, format: 'jpeg' });
    if (res.ok && res.data.saved) { toast('JPEG guardado', 'info'); onClose(); }
    else if (res.ok && !res.data.saved) { /* cancelado — no cerrar */ }
    else { toast('Error al guardar', 'error'); onClose(); }
  }, [onClose]);

  const handleCopyMarkdown = useCallback(async () => {
    const url = getExportDataUrl();
    if (!url) return;
    const md = `![captura](${url})`;
    try {
      await writeToClipboard(md);
      toast('Markdown copiado', 'info');
    } catch {
      toast('Error al copiar', 'error');
    }
    onClose();
  }, [getExportDataUrl, onClose]);

  if (!img) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Cargando…</span>
      </div>
    );
  }

  const stageW = img.naturalWidth;
  const stageH = img.naturalHeight;

  const containerW = Math.min(stageW, window.innerWidth - 80);
  const containerH = Math.min(stageH, window.innerHeight - 160);
  const scale = Math.min(containerW / stageW, containerH / stageH, 1);

  function renderAnnotation(ann: Annotation) {
    const key = ann.id;
    const common = {
      key,
      ref: (node: Konva.Shape | null) => {
        if (node) shapeRefs.current.set(ann.id, node);
        else shapeRefs.current.delete(ann.id);
      },
      onClick: () => { if (tool === 'select') setSelectedId(ann.id); },
    };

    if (ann.type === 'arrow') {
      return (
        <Arrow
          {...common}
          points={ann.points ?? []}
          stroke={ann.color}
          strokeWidth={ann.strokeWidth}
          fill={ann.color}
          pointerLength={10}
          pointerWidth={8}
          draggable={tool === 'select'}
        />
      );
    }
    if (ann.type === 'rect') {
      return (
        <Rect
          {...common}
          x={ann.x}
          y={ann.y}
          width={ann.width}
          height={ann.height}
          stroke={ann.color}
          strokeWidth={ann.strokeWidth}
          fill="transparent"
          draggable={tool === 'select'}
        />
      );
    }
    if (ann.type === 'ellipse') {
      return (
        <Ellipse
          {...common}
          x={ann.x}
          y={ann.y}
          radiusX={ann.radiusX ?? 0}
          radiusY={ann.radiusY ?? 0}
          stroke={ann.color}
          strokeWidth={ann.strokeWidth}
          fill="transparent"
          draggable={tool === 'select'}
        />
      );
    }
    if (ann.type === 'line') {
      return (
        <Line
          {...common}
          points={ann.points ?? []}
          stroke={ann.color}
          strokeWidth={ann.strokeWidth}
          draggable={tool === 'select'}
        />
      );
    }
    if (ann.type === 'highlight') {
      return (
        <Rect
          {...common}
          x={ann.x}
          y={ann.y}
          width={ann.width}
          height={ann.height}
          fill="rgba(234,179,8,0.4)"
          draggable={tool === 'select'}
        />
      );
    }
    if (ann.type === 'blur') {
      const blurCanvas = buildBlurredImage(ann);
      if (!blurCanvas) return null;
      const blurImg = new Image();
      blurImg.src = blurCanvas.toDataURL();
      const w = Math.abs(ann.width ?? 0);
      const h = Math.abs(ann.height ?? 0);
      const ox = (ann.width ?? 0) < 0 ? (ann.x ?? 0) + (ann.width ?? 0) : (ann.x ?? 0);
      const oy = (ann.height ?? 0) < 0 ? (ann.y ?? 0) + (ann.height ?? 0) : (ann.y ?? 0);
      return (
        <KonvaImage
          {...common}
          x={ox}
          y={oy}
          width={w}
          height={h}
          image={blurImg}
          draggable={tool === 'select'}
        />
      );
    }
    if (ann.type === 'text') {
      return (
        <Text
          {...common}
          x={ann.x}
          y={ann.y}
          text={ann.text ?? ''}
          fontSize={(ann.strokeWidth ?? 2) * 8}
          fill={ann.color}
          draggable={tool === 'select'}
        />
      );
    }
    return null;
  }

  const allAnnotations = currentAnn
    ? [...annotations, currentAnn]
    : annotations;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center outline-none"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
        if (e.ctrlKey && e.key === 'c') { e.preventDefault(); void handleCopy(); }
        if (e.ctrlKey && e.key === 's') { e.preventDefault(); void handleSavePng(); }
      }}
    >
      {/* Toolbar */}
      <div className="mb-3">
        <ScreenshotToolbar
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          canUndo={histIndex > 0}
          canRedo={histIndex < history.length - 1}
          onToolChange={setTool}
          onColorChange={setColor}
          onStrokeChange={setStrokeWidth}
          onUndo={undo}
          onRedo={redo}
        />
      </div>

      {/* Canvas */}
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          cursor: tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair',
          position: 'relative',
        }}
      >
        <Stage
          ref={stageRef}
          width={stageW * scale}
          height={stageH * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
          onClick={onStageClick}
        >
          <Layer>
            <KonvaImage image={img} x={0} y={0} width={stageW} height={stageH} />
            {allAnnotations.map((ann) => renderAnnotation(ann))}
            {selectedId && <Transformer ref={trRef} />}
          </Layer>
        </Stage>

        {/* Inline text input */}
        {textInput && (
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={onTextKeyDown}
            onBlur={commitText}
            style={{
              position: 'absolute',
              left: textInput.x * scale,
              top: textInput.y * scale,
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.5)',
              color: color,
              fontSize: strokeWidth * 8,
              outline: 'none',
              minWidth: 80,
              padding: '2px 4px',
            }}
          />
        )}
      </div>

      {/* Acciones finales */}
      <div
        className="mt-3 flex gap-2"
        onMouseDown={(e: MouseEvent) => e.stopPropagation()}
      >
        {[
          { label: 'Copiar', onClick: handleCopy },
          { label: 'Guardar PNG', onClick: handleSavePng },
          { label: 'Guardar JPEG', onClick: handleSaveJpeg },
          { label: 'Copiar como Markdown', onClick: handleCopyMarkdown },
        ].map(({ label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
          style={{
            background: 'transparent',
            color: 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
