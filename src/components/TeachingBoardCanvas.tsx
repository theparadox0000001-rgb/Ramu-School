import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Camera,
  Check,
  Circle,
  Copy,
  Download,
  Eraser,
  FileJson,
  Grid,
  Hand,
  Highlighter,
  ImagePlus,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Pen,
  Plus,
  Pointer,
  Redo2,
  RotateCcw,
  Sigma,
  Square,
  StickyNote,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Unlock,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  BoardElement,
  BoardGridType,
  BoardPoint,
  BoardSlide,
  BoardTheme,
  BoardToolType,
  PortalRole,
  SessionBoardState,
  SessionClassworkSnapshot,
  SessionMaterialItem,
} from '../types/portal';
import { getSessionToken, portalApi } from '../services/api';
import { renderMaterialPageToDataUrl } from './MaterialSlideViewerModal';

const BOARD_WIDTH = 1280;
const BOARD_HEIGHT = 720;

const STEM_SYMBOLS = [
  '∫',
  '∑',
  '∂',
  '√',
  'π',
  'θ',
  'λ',
  'μ₀',
  'ε₀',
  'Δ',
  '∞',
  '→',
  '⇌',
  '±',
  '≈',
  '≤',
  '≥',
  '°',
];

const STEM_FORMULAS = [
  { label: 'Solenoid Field', formula: 'B = μ₀ · n · I' },
  { label: 'Lorentz Force', formula: 'F = q(E + v × B)' },
  { label: 'Ideal Gas Law', formula: 'PV = nRT' },
  { label: 'Quadratic Root', formula: 'x = (-b ± √(b² - 4ac)) / 2a' },
  { label: 'Photosynthesis', formula: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂' },
  { label: 'Energy-Mass', formula: 'E = mc²' },
];

const COLOR_SWATCHES = [
  { hex: '#FFFFFF', label: 'White Chalk' },
  { hex: '#0F172A', label: 'Ink Black' },
  { hex: '#38BDF8', label: 'Sky Blue' },
  { hex: '#34D399', label: 'Emerald' },
  { hex: '#FBBF24', label: 'Amber Gold' },
  { hex: '#FB7185', label: 'Coral Red' },
  { hex: '#C084FC', label: 'Violet' },
];

interface TeachingBoardCanvasProps {
  liveClassId: string;
  sessionTitle: string;
  userId: string;
  userName: string;
  userRole: PortalRole;
  initialBoard?: SessionBoardState;
  materials?: SessionMaterialItem[];
  onSaveClasswork?: (snap: SessionClassworkSnapshot) => void;
  externalSlideBackground?: { dataUrl: string; label: string } | null;
  onClearExternalSlideBackground?: () => void;
}

interface RemoteCursor {
  userId: string;
  userName: string;
  x: number;
  y: number;
  ts: number;
}

interface LaserPoint {
  x: number;
  y: number;
  ts: number;
  color: string;
}

function createStarterSlide(title = 'Slide 1 — Teaching Canvas'): BoardSlide {
  return {
    id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    theme: 'blackboard',
    grid: 'grid',
    elements: [],
  };
}

function getElementBounds(el: BoardElement): { x: number; y: number; w: number; h: number } {
  if (el.points && el.points.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of el.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX - 8,
      y: minY - 8,
      w: Math.max(20, maxX - minX + 16),
      h: Math.max(20, maxY - minY + 16),
    };
  }
  if (el.type === 'line' || el.type === 'arrow' || el.type === 'dashed') {
    const x1 = el.x ?? 0;
    const y1 = el.y ?? 0;
    const x2 = el.x2 ?? x1;
    const y2 = el.y2 ?? y1;
    return {
      x: Math.min(x1, x2) - 8,
      y: Math.min(y1, y2) - 8,
      w: Math.max(20, Math.abs(x2 - x1) + 16),
      h: Math.max(20, Math.abs(y2 - y1) + 16),
    };
  }
  if (el.type === 'text') {
    const text = el.text || '';
    const lines = text.split('\n');
    const fs = el.fontSize || 24;
    const maxLen = Math.max(4, ...lines.map((l) => l.length));
    return {
      x: (el.x ?? 0) - 6,
      y: (el.y ?? 0) - fs,
      w: Math.max(60, maxLen * fs * 0.62 + 12),
      h: Math.max(fs + 12, lines.length * fs * 1.3 + 8),
    };
  }
  if (el.type === 'sticky') {
    return {
      x: el.x ?? 0,
      y: el.y ?? 0,
      w: el.width ?? 220,
      h: el.height ?? 140,
    };
  }
  return {
    x: el.x ?? 0,
    y: el.y ?? 0,
    w: Math.max(24, el.width ?? 120),
    h: Math.max(24, el.height ?? 90),
  };
}

function pointNearElement(px: number, py: number, el: BoardElement): boolean {
  const b = getElementBounds(el);
  if (px < b.x - 10 || px > b.x + b.w + 10 || py < b.y - 10 || py > b.y + b.h + 10) {
    return false;
  }
  if (el.points && el.points.length > 0) {
    for (const pt of el.points) {
      if (Math.hypot(pt.x - px, pt.y - py) < Math.max(14, el.strokeWidth + 8)) return true;
    }
    return false;
  }
  return true;
}

function moveElementBy(el: BoardElement, dx: number, dy: number): BoardElement {
  if (el.points) {
    return {
      ...el,
      points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  }
  return {
    ...el,
    x: (el.x ?? 0) + dx,
    y: (el.y ?? 0) + dy,
    x2: el.x2 !== undefined ? el.x2 + dx : undefined,
    y2: el.y2 !== undefined ? el.y2 + dy : undefined,
  };
}

function drawSlideBackgroundAndGrid(
  ctx: CanvasRenderingContext2D,
  theme: BoardTheme,
  grid: BoardGridType
) {
  if (theme === 'whiteboard') {
    ctx.fillStyle = '#F8FAFC';
  } else if (theme === 'chalkboard') {
    ctx.fillStyle = '#113328';
  } else {
    ctx.fillStyle = '#090D16';
  }
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  const gridStroke =
    theme === 'whiteboard'
      ? 'rgba(15, 23, 42, 0.08)'
      : theme === 'chalkboard'
      ? 'rgba(255, 255, 255, 0.09)'
      : 'rgba(148, 163, 184, 0.11)';

  if (grid === 'grid') {
    ctx.save();
    ctx.strokeStyle = gridStroke;
    ctx.lineWidth = 1;
    for (let x = 0; x <= BOARD_WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, BOARD_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= BOARD_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();
  } else if (grid === 'lined') {
    ctx.save();
    ctx.strokeStyle = gridStroke;
    ctx.lineWidth = 1;
    for (let y = 56; y <= BOARD_HEIGHT; y += 42) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
      ctx.stroke();
    }
    ctx.strokeStyle = theme === 'whiteboard' ? 'rgba(225, 29, 72, 0.25)' : 'rgba(244, 63, 94, 0.25)';
    ctx.beginPath();
    ctx.moveTo(96, 0);
    ctx.lineTo(96, BOARD_HEIGHT);
    ctx.stroke();
    ctx.restore();
  } else if (grid === 'axes') {
    ctx.save();
    ctx.strokeStyle = gridStroke;
    ctx.lineWidth = 1;
    for (let x = 0; x <= BOARD_WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, BOARD_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= BOARD_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_WIDTH, y);
      ctx.stroke();
    }
    const cx = BOARD_WIDTH / 2;
    const cy = BOARD_HEIGHT / 2;
    ctx.strokeStyle = theme === 'whiteboard' ? '#334155' : '#94A3B8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, cy);
    ctx.lineTo(BOARD_WIDTH - 40, cy);
    ctx.moveTo(cx, 30);
    ctx.lineTo(cx, BOARD_HEIGHT - 30);
    ctx.stroke();
    ctx.fillStyle = theme === 'whiteboard' ? '#334155' : '#CBD5E1';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('X', BOARD_WIDTH - 55, cy - 10);
    ctx.fillText('Y', cx + 10, 46);
    ctx.fillText('O (0,0)', cx + 8, cy + 18);
    ctx.restore();
  }
}

function drawBoardElement(
  ctx: CanvasRenderingContext2D,
  el: BoardElement,
  imageCache: Map<string, HTMLImageElement>,
  onImageLoad: () => void,
  isSelected = false
) {
  ctx.save();
  ctx.globalAlpha = el.opacity ?? (el.type === 'highlighter' ? 0.34 : 1);
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.fillColor || el.color;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (el.type === 'pen' || el.type === 'highlighter') {
    const pts = el.points || [];
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, el.strokeWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = el.color;
      ctx.fill();
    } else if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  } else if (el.type === 'line' || el.type === 'dashed' || el.type === 'arrow') {
    const x1 = el.x ?? 0;
    const y1 = el.y ?? 0;
    const x2 = el.x2 ?? x1;
    const y2 = el.y2 ?? y1;
    if (el.type === 'dashed') {
      ctx.setLineDash([10, 8]);
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (el.type === 'arrow') {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(14, el.strokeWidth * 3.8);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle - Math.PI / 6),
        y2 - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + Math.PI / 6),
        y2 - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = el.color;
      ctx.fill();
    }
  } else if (el.type === 'rect') {
    ctx.strokeRect(el.x ?? 0, el.y ?? 0, el.width ?? 0, el.height ?? 0);
  } else if (el.type === 'circle') {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (el.type === 'triangle') {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.stroke();
  } else if (el.type === 'text') {
    const fs = el.fontSize || 24;
    ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = el.color;
    const lines = (el.text || '').split('\n');
    lines.forEach((line, idx) => {
      ctx.fillText(line, el.x ?? 0, (el.y ?? 0) + idx * fs * 1.3);
    });
  } else if (el.type === 'sticky') {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const w = el.width ?? 220;
    const h = el.height ?? 140;
    ctx.fillStyle = el.fillColor || '#FEF08A';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#CA8A04';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#EAB308';
    ctx.fillRect(x, y, w, 18);
    ctx.fillStyle = '#1E293B';
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    const words = (el.text || 'Concept Note').split(/\s+/);
    let line = '';
    let curY = y + 44;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > w - 24 && line) {
        ctx.fillText(line, x + 12, curY);
        line = word;
        curY += 22;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x + 12, curY);
  } else if (el.type === 'graph') {
    const x = el.x ?? 340;
    const y = el.y ?? 160;
    const w = el.width ?? 600;
    const h = el.height ?? 380;
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.strokeStyle = el.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + w, cy);
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + h);
    ctx.stroke();

    if (el.graphPreset === 'parabola' || el.graphPreset === 'sine') {
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * 2 - 1; // -1 to 1
        const px = cx + t * (w * 0.45);
        const py =
          el.graphPreset === 'parabola'
            ? cy - (t * t * 1.15 - 0.35) * (h * 0.45)
            : cy - Math.sin(t * Math.PI * 2) * (h * 0.36);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = el.color;
      ctx.font = 'bold 14px monospace';
      ctx.fillText(el.graphPreset === 'parabola' ? 'y = ax² + c' : 'y = A sin(ωx)', x + 12, y + 22);
    }
  } else if (el.type === 'image' && el.imageDataUrl) {
    let img = imageCache.get(el.imageDataUrl);
    if (!img) {
      img = new Image();
      img.onload = onImageLoad;
      img.src = el.imageDataUrl;
      imageCache.set(el.imageDataUrl, img);
    }
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, el.x ?? 60, el.y ?? 60, el.width ?? 360, el.height ?? 220);
    }
  }

  if (isSelected) {
    const b = getElementBounds(el);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

export const TeachingBoardCanvas: React.FC<TeachingBoardCanvasProps> = ({
  liveClassId,
  sessionTitle,
  userId,
  userName,
  userRole,
  initialBoard,
  materials = [],
  onSaveClasswork,
  externalSlideBackground,
  onClearExternalSlideBackground,
}) => {
  const isEducator = userRole === 'teacher' || userRole === 'admin';

  const [slides, setSlides] = useState<BoardSlide[]>(() =>
    initialBoard && initialBoard.slides.length > 0
      ? initialBoard.slides
      : [createStarterSlide(`${sessionTitle} — Slide 1`)]
  );
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(
    initialBoard?.activeSlideIndex ?? 0
  );
  const [allowStudentDraw, setAllowStudentDraw] = useState<boolean>(
    initialBoard?.allowStudentDraw ?? false
  );

  // Sync if initialBoard changes for a new session
  useEffect(() => {
    if (initialBoard && initialBoard.slides.length > 0) {
      setSlides(initialBoard.slides);
      setActiveSlideIndex(
        Math.min(initialBoard.activeSlideIndex || 0, initialBoard.slides.length - 1)
      );
      setAllowStudentDraw(initialBoard.allowStudentDraw);
    }
  }, [liveClassId, initialBoard]);

  const currentSlide = slides[activeSlideIndex] || slides[0] || createStarterSlide();
  const currentTheme: BoardTheme = currentSlide.theme || 'blackboard';
  const currentGrid: BoardGridType = currentSlide.grid || 'grid';
  const canDraw = isEducator || allowStudentDraw;

  // Tool & appearance state
  const [tool, setTool] = useState<BoardToolType>('pen');
  const [color, setColor] = useState<string>('#38BDF8');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Tool drawers
  const [showSymbolDrawer, setShowSymbolDrawer] = useState(false);
  const [showSlideImportDrawer, setShowSlideImportDrawer] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');

  // Floating Text / Sticky Note input overlay
  const [textDraft, setTextDraft] = useState<{
    x: number;
    y: number;
    value: string;
    mode: 'text' | 'sticky';
  } | null>(null);

  // Undo / Redo per slide
  const [undoStack, setUndoStack] = useState<Record<string, BoardElement[][]>>({});
  const [redoStack, setRedoStack] = useState<Record<string, BoardElement[][]>>({});

  // WebSocket & Collaboration state
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const [laserTrails, setLaserTrails] = useState<LaserPoint[]>([]);
  const lastCursorSentRef = useRef<number>(0);

  // Refs for rendering and interaction
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const draftElementRef = useRef<BoardElement | null>(null);
  const dragStateRef = useRef<{
    mode: 'draw' | 'move' | 'pan' | 'erase' | 'laser' | null;
    startX: number;
    startY: number;
    lastClientX: number;
    lastClientY: number;
    movingElementId?: string;
    erasedIds?: Set<string>;
  }>({ mode: null, startX: 0, startY: 0, lastClientX: 0, lastClientY: 0 });
  const [renderTick, setRenderTick] = useState(0);

  const sendWs = useCallback((type: string, payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }, []);

  // Debounced REST persistence to SQLite as safety net alongside WS
  const saveTimerRef = useRef<number | null>(null);
  const persistBoardToRest = useCallback(
    (nextSlides: BoardSlide[], nextSlideIdx: number, nextAllowDraw: boolean) => {
      if (!getSessionToken()) return;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        portalApi
          .saveLiveSessionBoard(liveClassId, {
            slides: nextSlides,
            activeSlideIndex: nextSlideIdx,
            allowStudentDraw: nextAllowDraw,
          })
          .catch(() => undefined);
      }, 450);
    },
    [liveClassId]
  );

  // Connect WebSocket for live multi-user sync
  useEffect(() => {
    const token = getSessionToken();
    if (!token || !liveClassId) return;
    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws/classroom?classId=${encodeURIComponent(
        liveClassId
      )}&token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type: string; payload?: any };
          if (msg.type === 'presence:state' && msg.payload) {
            setOnlineCount(msg.payload.onlineCount || 1);
          } else if (msg.type === 'board:init' && msg.payload) {
            const b = msg.payload as SessionBoardState;
            if (Array.isArray(b.slides) && b.slides.length > 0) {
              setSlides(b.slides);
              setActiveSlideIndex(Math.min(b.activeSlideIndex || 0, b.slides.length - 1));
              setAllowStudentDraw(Boolean(b.allowStudentDraw));
            }
          } else if (msg.type === 'board:element_add' && msg.payload) {
            const { slideId, element } = msg.payload as {
              slideId: string;
              element: BoardElement;
            };
            setSlides((prev) =>
              prev.map((s) => {
                if (s.id !== slideId) return s;
                if (s.elements.some((e) => e.id === element.id)) return s;
                return { ...s, elements: [...s.elements, element] };
              })
            );
          } else if (msg.type === 'board:element_update' && msg.payload) {
            const { slideId, element } = msg.payload as {
              slideId: string;
              element: BoardElement;
            };
            setSlides((prev) =>
              prev.map((s) =>
                s.id === slideId
                  ? { ...s, elements: s.elements.map((e) => (e.id === element.id ? element : e)) }
                  : s
              )
            );
          } else if (msg.type === 'board:element_delete' && msg.payload) {
            const { slideId, elementId } = msg.payload as {
              slideId: string;
              elementId: string;
            };
            setSlides((prev) =>
              prev.map((s) =>
                s.id === slideId
                  ? { ...s, elements: s.elements.filter((e) => e.id !== elementId) }
                  : s
              )
            );
          } else if (msg.type === 'board:slide_change' && msg.payload) {
            setActiveSlideIndex(Number(msg.payload.activeSlideIndex) || 0);
          } else if (msg.type === 'board:slide_update' && msg.payload) {
            const { slideId, patch } = msg.payload as {
              slideId: string;
              patch: Partial<BoardSlide>;
            };
            setSlides((prev) => prev.map((s) => (s.id === slideId ? { ...s, ...patch } : s)));
          } else if (msg.type === 'board:clear' && msg.payload) {
            const { slideId } = msg.payload as { slideId: string };
            setSlides((prev) =>
              prev.map((s) => (s.id === slideId ? { ...s, elements: [] } : s))
            );
          } else if (msg.type === 'board:lock_toggle' && msg.payload) {
            setAllowStudentDraw(Boolean(msg.payload.allowStudentDraw));
          } else if (msg.type === 'board:cursor' && msg.payload) {
            const c = msg.payload as { userId: string; userName: string; x: number; y: number };
            if (c.userId !== userId) {
              setRemoteCursors((prev) => ({
                ...prev,
                [c.userId]: { ...c, ts: Date.now() },
              }));
            }
          } else if (msg.type === 'board:laser' && msg.payload) {
            const l = msg.payload as { x: number; y: number; color?: string };
            setLaserTrails((prev) => [
              ...prev.slice(-30),
              { x: l.x, y: l.y, ts: Date.now(), color: l.color || '#EF4444' },
            ]);
          }
        } catch {
          // ignore malformed event
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!cancelled) {
          setWsConnected(false);
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [liveClassId, userId]);

  // Fade out remote cursors & laser pointer trails
  useEffect(() => {
    if (laserTrails.length === 0 && Object.keys(remoteCursors).length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setLaserTrails((prev) => prev.filter((pt) => now - pt.ts < 850));
      setRemoteCursors((prev) => {
        const next: Record<string, RemoteCursor> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.ts < 2500) next[k] = v;
        }
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [laserTrails.length, Object.keys(remoteCursors).length]);

  // Apply external slide background when teacher/student clicks "Annotate on Board" in Material Viewer
  useEffect(() => {
    if (!externalSlideBackground) return;
    const targetSlideId = currentSlide.id;
    const patch: Partial<BoardSlide> = {
      theme: 'whiteboard',
      grid: 'none',
      backgroundDataUrl: externalSlideBackground.dataUrl,
      backgroundLabel: externalSlideBackground.label,
      title: externalSlideBackground.label,
    };
    const nextSlides = slides.map((s) => (s.id === targetSlideId ? { ...s, ...patch } : s));
    setSlides(nextSlides);
    setColor('#0F172A');
    sendWs('board:slide_update', { slideId: targetSlideId, patch });
    persistBoardToRest(nextSlides, activeSlideIndex, allowStudentDraw);
    setStatusNotice(`Slide "${externalSlideBackground.label}" loaded onto board for annotation.`);
    onClearExternalSlideBackground?.();
  }, [externalSlideBackground]);

  // Push slide elements snapshot onto Undo stack before mutation
  const pushUndo = useCallback((slideId: string, prevElements: BoardElement[]) => {
    setUndoStack((prev) => ({
      ...prev,
      [slideId]: [...(prev[slideId] || []).slice(-35), prevElements],
    }));
    setRedoStack((prev) => ({ ...prev, [slideId]: [] }));
  }, []);

  const updateCurrentElements = useCallback(
    (updater: (els: BoardElement[]) => BoardElement[], recordHistory = true) => {
      const slideId = currentSlide.id;
      setSlides((prev) => {
        const next = prev.map((s) => {
          if (s.id !== slideId) return s;
          if (recordHistory) pushUndo(slideId, s.elements);
          return { ...s, elements: updater(s.elements) };
        });
        persistBoardToRest(next, activeSlideIndex, allowStudentDraw);
        return next;
      });
    },
    [currentSlide.id, pushUndo, persistBoardToRest, activeSlideIndex, allowStudentDraw]
  );

  const handleUndo = useCallback(() => {
    if (!canDraw) return;
    const stack = undoStack[currentSlide.id] || [];
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    setUndoStack((u) => ({ ...u, [currentSlide.id]: stack.slice(0, -1) }));
    setRedoStack((r) => ({
      ...r,
      [currentSlide.id]: [...(r[currentSlide.id] || []), currentSlide.elements],
    }));
    const nextSlides = slides.map((s) =>
      s.id === currentSlide.id ? { ...s, elements: previous } : s
    );
    setSlides(nextSlides);
    sendWs('board:full_sync', { slides: nextSlides, activeSlideIndex, allowStudentDraw });
    persistBoardToRest(nextSlides, activeSlideIndex, allowStudentDraw);
  }, [
    canDraw,
    undoStack,
    currentSlide.id,
    currentSlide.elements,
    slides,
    sendWs,
    activeSlideIndex,
    allowStudentDraw,
    persistBoardToRest,
  ]);

  const handleRedo = useCallback(() => {
    if (!canDraw) return;
    const stack = redoStack[currentSlide.id] || [];
    if (stack.length === 0) return;
    const restored = stack[stack.length - 1];
    setRedoStack((r) => ({ ...r, [currentSlide.id]: stack.slice(0, -1) }));
    setUndoStack((u) => ({
      ...u,
      [currentSlide.id]: [...(u[currentSlide.id] || []), currentSlide.elements],
    }));
    const nextSlides = slides.map((s) =>
      s.id === currentSlide.id ? { ...s, elements: restored } : s
    );
    setSlides(nextSlides);
    sendWs('board:full_sync', { slides: nextSlides, activeSlideIndex, allowStudentDraw });
    persistBoardToRest(nextSlides, activeSlideIndex, allowStudentDraw);
  }, [
    canDraw,
    redoStack,
    currentSlide.id,
    currentSlide.elements,
    slides,
    sendWs,
    activeSlideIndex,
    allowStudentDraw,
    persistBoardToRest,
  ]);

  const handleDeleteSelected = useCallback(() => {
    if (!canDraw || !selectedId) return;
    updateCurrentElements((els) => els.filter((e) => e.id !== selectedId));
    sendWs('board:element_delete', { slideId: currentSlide.id, elementId: selectedId });
    setSelectedId(null);
  }, [canDraw, selectedId, updateCurrentElements, sendWs, currentSlide.id]);

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Delete)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (textDraft) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        handleRedo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, handleDeleteSelected, selectedId, textDraft]);

  // Render entire board onto Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawSlideBackgroundAndGrid(ctx, currentTheme, currentGrid);

    // Draw slide background overlay (if imported PPT/PDF page or uploaded slide)
    if (currentSlide.backgroundDataUrl) {
      let bgImg = imageCacheRef.current.get(currentSlide.backgroundDataUrl);
      if (!bgImg) {
        bgImg = new Image();
        bgImg.onload = () => setRenderTick((t) => t + 1);
        bgImg.src = currentSlide.backgroundDataUrl;
        imageCacheRef.current.set(currentSlide.backgroundDataUrl, bgImg);
      }
      if (bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.drawImage(bgImg, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      }
    }

    for (const el of currentSlide.elements) {
      drawBoardElement(
        ctx,
        el,
        imageCacheRef.current,
        () => setRenderTick((t) => t + 1),
        el.id === selectedId
      );
    }

    if (draftElementRef.current) {
      drawBoardElement(ctx, draftElementRef.current, imageCacheRef.current, () => {});
    }

    // Laser trail glow
    if (laserTrails.length > 0) {
      const now = Date.now();
      for (let i = 0; i < laserTrails.length; i++) {
        const pt = laserTrails[i];
        const age = (now - pt.ts) / 850;
        const alpha = Math.max(0, 1 - age);
        ctx.save();
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = alpha * 0.85;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, i === laserTrails.length - 1 ? 8 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }, [currentSlide, currentTheme, currentGrid, selectedId, laserTrails, renderTick]);

  // Convert pointer event into logical 1280x720 board coordinates
  const toBoardPoint = (e: React.PointerEvent<HTMLCanvasElement>): BoardPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * BOARD_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * BOARD_HEIGHT;
    return {
      x: Math.max(0, Math.min(BOARD_WIDTH, x)),
      y: Math.max(0, Math.min(BOARD_HEIGHT, y)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (panMode || e.button === 1) {
      canvas.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        mode: 'pan',
        startX: 0,
        startY: 0,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      return;
    }

    const pt = toBoardPoint(e);

    if (tool === 'laser') {
      canvas.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        mode: 'laser',
        startX: pt.x,
        startY: pt.y,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      setLaserTrails((prev) => [...prev.slice(-30), { x: pt.x, y: pt.y, ts: Date.now(), color: '#EF4444' }]);
      sendWs('board:laser', { x: pt.x, y: pt.y, color: '#EF4444' });
      return;
    }

    if (!canDraw) {
      setStatusNotice('Board is currently locked by faculty (view-only mode).');
      return;
    }

    if (tool === 'text' || tool === 'sticky') {
      setTextDraft({ x: pt.x, y: pt.y, value: '', mode: tool });
      return;
    }

    canvas.setPointerCapture(e.pointerId);

    if (tool === 'select') {
      const hit = [...currentSlide.elements].reverse().find((el) => pointNearElement(pt.x, pt.y, el));
      if (hit) {
        setSelectedId(hit.id);
        pushUndo(currentSlide.id, currentSlide.elements);
        dragStateRef.current = {
          mode: 'move',
          startX: pt.x,
          startY: pt.y,
          lastClientX: e.clientX,
          lastClientY: e.clientY,
          movingElementId: hit.id,
        };
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (tool === 'eraser') {
      dragStateRef.current = {
        mode: 'erase',
        startX: pt.x,
        startY: pt.y,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        erasedIds: new Set(),
      };
      const hit = [...currentSlide.elements].reverse().find((el) => pointNearElement(pt.x, pt.y, el));
      if (hit) {
        dragStateRef.current.erasedIds?.add(hit.id);
        updateCurrentElements((els) => els.filter((el) => el.id !== hit.id));
        sendWs('board:element_delete', { slideId: currentSlide.id, elementId: hit.id });
      }
      return;
    }

    // Freehand or geometric shapes
    const newId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const baseEl: BoardElement = {
      id: newId,
      type: tool === 'graph' ? 'graph' : tool,
      authorId: userId,
      authorName: userName,
      color,
      strokeWidth: tool === 'highlighter' ? Math.max(16, strokeWidth * 3.5) : strokeWidth,
      opacity: tool === 'highlighter' ? 0.35 : 1,
    };

    if (tool === 'pen' || tool === 'highlighter') {
      baseEl.points = [pt];
    } else if (tool === 'line' || tool === 'arrow' || tool === 'dashed') {
      baseEl.x = pt.x;
      baseEl.y = pt.y;
      baseEl.x2 = pt.x;
      baseEl.y2 = pt.y;
    } else {
      baseEl.x = pt.x;
      baseEl.y = pt.y;
      baseEl.width = 4;
      baseEl.height = 4;
    }

    draftElementRef.current = baseEl;
    dragStateRef.current = {
      mode: 'draw',
      startX: pt.x,
      startY: pt.y,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
    };
    setRenderTick((t) => t + 1);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toBoardPoint(e);

    // Throttled live cursor broadcast
    const now = Date.now();
    if (now - lastCursorSentRef.current > 45) {
      lastCursorSentRef.current = now;
      sendWs('board:cursor', { x: pt.x, y: pt.y });
    }

    const drag = dragStateRef.current;
    if (!drag.mode) return;

    if (drag.mode === 'pan') {
      const dx = e.clientX - drag.lastClientX;
      const dy = e.clientY - drag.lastClientY;
      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }

    if (drag.mode === 'laser') {
      setLaserTrails((prev) => [...prev.slice(-30), { x: pt.x, y: pt.y, ts: Date.now(), color: '#EF4444' }]);
      sendWs('board:laser', { x: pt.x, y: pt.y, color: '#EF4444' });
      return;
    }

    if (drag.mode === 'move' && drag.movingElementId) {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      drag.startX = pt.x;
      drag.startY = pt.y;
      setSlides((prev) =>
        prev.map((s) =>
          s.id === currentSlide.id
            ? {
                ...s,
                elements: s.elements.map((el) =>
                  el.id === drag.movingElementId ? moveElementBy(el, dx, dy) : el
                ),
              }
            : s
        )
      );
      return;
    }

    if (drag.mode === 'erase') {
      const hit = [...currentSlide.elements].reverse().find((el) => pointNearElement(pt.x, pt.y, el));
      if (hit && !drag.erasedIds?.has(hit.id)) {
        drag.erasedIds?.add(hit.id);
        updateCurrentElements((els) => els.filter((el) => el.id !== hit.id));
        sendWs('board:element_delete', { slideId: currentSlide.id, elementId: hit.id });
      }
      return;
    }

    if (drag.mode === 'draw' && draftElementRef.current) {
      const draft = draftElementRef.current;
      if (draft.type === 'pen' || draft.type === 'highlighter') {
        draft.points = [...(draft.points || []), pt];
      } else if (draft.type === 'line' || draft.type === 'arrow' || draft.type === 'dashed') {
        draft.x2 = pt.x;
        draft.y2 = pt.y;
      } else {
        draft.x = Math.min(drag.startX, pt.x);
        draft.y = Math.min(drag.startY, pt.y);
        draft.width = Math.abs(pt.x - drag.startX);
        draft.height = Math.abs(pt.y - drag.startY);
      }
      setRenderTick((t) => t + 1);
    }
  };

  const handlePointerUp = () => {
    const drag = dragStateRef.current;
    if (drag.mode === 'move' && drag.movingElementId) {
      const moved = currentSlide.elements.find((e) => e.id === drag.movingElementId);
      if (moved) {
        sendWs('board:element_update', { slideId: currentSlide.id, element: moved });
        persistBoardToRest(slides, activeSlideIndex, allowStudentDraw);
      }
    } else if (drag.mode === 'draw' && draftElementRef.current) {
      const finalized = { ...draftElementRef.current };
      draftElementRef.current = null;
      updateCurrentElements((els) => [...els, finalized]);
      sendWs('board:element_add', { slideId: currentSlide.id, element: finalized });
    }
    dragStateRef.current = { mode: null, startX: 0, startY: 0, lastClientX: 0, lastClientY: 0 };
  };

  const commitTextDraft = () => {
    if (!textDraft) return;
    const text = textDraft.value.trim();
    if (text) {
      const element: BoardElement =
        textDraft.mode === 'sticky'
          ? {
              id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'sticky',
              authorId: userId,
              authorName: userName,
              color: '#1E293B',
              fillColor: '#FEF08A',
              strokeWidth: 2,
              x: Math.min(textDraft.x, BOARD_WIDTH - 240),
              y: Math.min(textDraft.y, BOARD_HEIGHT - 160),
              width: 230,
              height: 145,
              text,
            }
          : {
              id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'text',
              authorId: userId,
              authorName: userName,
              color,
              strokeWidth: 2,
              x: textDraft.x,
              y: Math.max(36, textDraft.y),
              text,
              fontSize: 24,
            };
      updateCurrentElements((els) => [...els, element]);
      sendWs('board:element_add', { slideId: currentSlide.id, element });
    }
    setTextDraft(null);
  };

  const handleInsertSymbolOrFormula = (snippet: string) => {
    if (!canDraw) return;
    if (textDraft) {
      setTextDraft((prev) => (prev ? { ...prev, value: `${prev.value}${snippet}` } : null));
      return;
    }
    const element: BoardElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'text',
      authorId: userId,
      authorName: userName,
      color,
      strokeWidth: 2,
      x: 120 + (currentSlide.elements.length % 5) * 40,
      y: 120 + (currentSlide.elements.length % 6) * 52,
      text: snippet,
      fontSize: snippet.length > 6 ? 24 : 32,
    };
    updateCurrentElements((els) => [...els, element]);
    sendWs('board:element_add', { slideId: currentSlide.id, element });
    setShowSymbolDrawer(false);
  };

  const handleInsertGraph = (preset: 'axes' | 'parabola' | 'sine') => {
    if (!canDraw) return;
    const element: BoardElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'graph',
      graphPreset: preset,
      authorId: userId,
      authorName: userName,
      color: currentTheme === 'whiteboard' ? '#334155' : '#94A3B8',
      strokeWidth: 2,
      x: 340,
      y: 150,
      width: 600,
      height: 400,
    };
    updateCurrentElements((els) => [...els, element]);
    sendWs('board:element_add', { slideId: currentSlide.id, element });
  };

  const handleThemeChange = (theme: BoardTheme) => {
    if (!canDraw) return;
    const patch: Partial<BoardSlide> = { theme };
    const nextSlides = slides.map((s) => (s.id === currentSlide.id ? { ...s, ...patch } : s));
    setSlides(nextSlides);
    if (theme === 'whiteboard' && color === '#FFFFFF') setColor('#0F172A');
    if (theme !== 'whiteboard' && color === '#0F172A') setColor('#FFFFFF');
    sendWs('board:slide_update', { slideId: currentSlide.id, patch });
    persistBoardToRest(nextSlides, activeSlideIndex, allowStudentDraw);
  };

  const handleGridChange = (grid: BoardGridType) => {
    if (!canDraw) return;
    const patch: Partial<BoardSlide> = { grid };
    const nextSlides = slides.map((s) => (s.id === currentSlide.id ? { ...s, ...patch } : s));
    setSlides(nextSlides);
    sendWs('board:slide_update', { slideId: currentSlide.id, patch });
    persistBoardToRest(nextSlides, activeSlideIndex, allowStudentDraw);
  };

  const handleSwitchSlide = (idx: number) => {
    const safeIdx = Math.max(0, Math.min(idx, slides.length - 1));
    setActiveSlideIndex(safeIdx);
    setSelectedId(null);
    sendWs('board:slide_change', { activeSlideIndex: safeIdx });
    persistBoardToRest(slides, safeIdx, allowStudentDraw);
  };

  const handleAddSlide = () => {
    if (!canDraw) return;
    const next = createStarterSlide(`Slide ${slides.length + 1}`);
    next.theme = currentTheme;
    next.grid = currentGrid;
    const nextSlides = [...slides, next];
    const nextIdx = nextSlides.length - 1;
    setSlides(nextSlides);
    setActiveSlideIndex(nextIdx);
    setSelectedId(null);
    sendWs('board:full_sync', { slides: nextSlides, activeSlideIndex: nextIdx, allowStudentDraw });
    persistBoardToRest(nextSlides, nextIdx, allowStudentDraw);
  };

  const handleDuplicateSlide = () => {
    if (!canDraw) return;
    const copy: BoardSlide = {
      ...currentSlide,
      id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `${currentSlide.title} (Copy)`,
      elements: currentSlide.elements.map((e) => ({ ...e })),
    };
    const nextSlides = [...slides, copy];
    const nextIdx = nextSlides.length - 1;
    setSlides(nextSlides);
    setActiveSlideIndex(nextIdx);
    sendWs('board:full_sync', { slides: nextSlides, activeSlideIndex: nextIdx, allowStudentDraw });
    persistBoardToRest(nextSlides, nextIdx, allowStudentDraw);
  };

  const handleDeleteSlide = () => {
    if (!canDraw || slides.length <= 1) return;
    const nextSlides = slides.filter((_, idx) => idx !== activeSlideIndex);
    const nextIdx = Math.max(0, activeSlideIndex - 1);
    setSlides(nextSlides);
    setActiveSlideIndex(nextIdx);
    setSelectedId(null);
    sendWs('board:full_sync', { slides: nextSlides, activeSlideIndex: nextIdx, allowStudentDraw });
    persistBoardToRest(nextSlides, nextIdx, allowStudentDraw);
  };

  const handleClearSlide = () => {
    if (!canDraw) return;
    pushUndo(currentSlide.id, currentSlide.elements);
    const patch: Partial<BoardSlide> = { backgroundDataUrl: undefined, backgroundLabel: undefined };
    const nextSlides = slides.map((s) =>
      s.id === currentSlide.id ? { ...s, ...patch, elements: [] } : s
    );
    setSlides(nextSlides);
    setSelectedId(null);
    sendWs('board:clear', { slideId: currentSlide.id });
    sendWs('board:slide_update', { slideId: currentSlide.id, patch });
    persistBoardToRest(nextSlides, activeSlideIndex, allowStudentDraw);
  };

  const handleToggleLock = () => {
    if (!isEducator) return;
    const next = !allowStudentDraw;
    setAllowStudentDraw(next);
    sendWs('board:lock_toggle', { allowStudentDraw: next });
    persistBoardToRest(slides, activeSlideIndex, next);
  };

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canDraw) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const element: BoardElement = {
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'image',
        authorId: userId,
        authorName: userName,
        color: '#FFFFFF',
        strokeWidth: 1,
        x: 220,
        y: 110,
        width: 520,
        height: 320,
        imageDataUrl: dataUrl,
      };
      updateCurrentElements((els) => [...els, element]);
      sendWs('board:element_add', { slideId: currentSlide.id, element });
    };
    reader.readAsDataURL(file);
  };

  const handleStampMaterialPage = (mat: SessionMaterialItem, pageIdx = 0) => {
    if (!canDraw) return;
    const page = mat.pages[pageIdx] || mat.pages[0];
    if (!page) return;
    const dataUrl = renderMaterialPageToDataUrl(mat, page);
    if (!dataUrl) return;
    const patch: Partial<BoardSlide> = {
      theme: 'whiteboard',
      grid: 'none',
      backgroundDataUrl: dataUrl,
      backgroundLabel: `${mat.title} · P.${page.pageNo}`,
    };
    const nextSlides = slides.map((s) => (s.id === currentSlide.id ? { ...s, ...patch } : s));
    setSlides(nextSlides);
    setColor('#0F172A');
    setShowSlideImportDrawer(false);
    sendWs('board:slide_update', { slideId: currentSlide.id, patch });
    persistBoardToRest(nextSlides, activeSlideIndex, allowStudentDraw);
    setStatusNotice(`Loaded "${mat.title}" (Page ${page.pageNo}) onto current board slide.`);
  };

  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${liveClassId}-slide-${activeSlideIndex + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify({ liveClassId, slides }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${liveClassId}-board-deck.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveClassworkSnapshot = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const imageDataUrl = canvas.toDataURL('image/png');
    try {
      const res = await portalApi.saveSessionClasswork(liveClassId, {
        title: `${currentSlide.title} Snapshot`,
        slideTitle: currentSlide.title,
        imageDataUrl,
      });
      onSaveClasswork?.(res.classwork);
      setStatusNotice('Saved annotated board snapshot to Classwork archive!');
    } catch {
      setStatusNotice('Snapshot exported locally (sign in to sync to Classwork DB).');
    }
  };

  const toolButtons = useMemo(
    () =>
      [
        { id: 'select', label: 'Select & Move', icon: MousePointer2 },
        { id: 'pen', label: 'Pen', icon: Pen },
        { id: 'highlighter', label: 'Highlighter', icon: Highlighter },
        { id: 'laser', label: 'Laser Pointer', icon: Pointer },
        { id: 'eraser', label: 'Eraser', icon: Eraser },
        { id: 'line', label: 'Line', icon: Minus },
        { id: 'arrow', label: 'Vector Arrow', icon: ArrowUpRight },
        { id: 'dashed', label: 'Dashed Ray', icon: RotateCcw },
        { id: 'rect', label: 'Rectangle', icon: Square },
        { id: 'circle', label: 'Circle / Ellipse', icon: Circle },
        { id: 'triangle', label: 'Triangle', icon: Triangle },
        { id: 'text', label: 'Text Box', icon: Type },
        { id: 'sticky', label: 'Sticky Note', icon: StickyNote },
      ] as Array<{ id: BoardToolType; label: string; icon: React.ComponentType<{ className?: string }> }>,
    []
  );

  const canUndo = (undoStack[currentSlide.id] || []).length > 0;
  const canRedo = (redoStack[currentSlide.id] || []).length > 0;

  return (
    <div
      ref={containerRef}
      className={`${
        fullscreen ? 'fixed inset-0 z-[80] p-3 sm:p-5 bg-slate-950 flex flex-col' : 'flex flex-col'
      } rounded-2xl border border-slate-800 bg-[#0d1117] text-slate-100 overflow-hidden select-none`}
    >
      {/* Top Studio Bar: Sync Status, Surface/Grid Selectors, Permission Lock, Export & Classwork */}
      <div className="px-3.5 py-2.5 bg-[#121824] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
            <span
              className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}
            />
            <span>{wsConnected ? 'Live Board Sync' : 'Local Studio'}</span>
            <span className="text-slate-500">·</span>
            <span className="inline-flex items-center gap-1 text-sky-300 tabular-nums">
              <Users className="w-3.5 h-3.5" />
              <span>{onlineCount} online</span>
            </span>
          </div>

          {/* Surface Switcher */}
          <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5">
            {(
              [
                { id: 'blackboard', label: 'Blackboard' },
                { id: 'chalkboard', label: 'Chalk' },
                { id: 'whiteboard', label: 'Whiteboard' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={!canDraw}
                onClick={() => handleThemeChange(t.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer disabled:opacity-40 ${
                  currentTheme === t.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Grid Switcher */}
          <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5">
            {(
              [
                { id: 'none', label: 'Blank' },
                { id: 'grid', label: 'Grid' },
                { id: 'lined', label: 'Ruled' },
                { id: 'axes', label: 'XY Axes' },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={!canDraw}
                onClick={() => handleGridChange(g.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer disabled:opacity-40 ${
                  currentGrid === g.id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {isEducator ? (
            <button
              type="button"
              onClick={handleToggleLock}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                allowStudentDraw
                  ? 'border-emerald-600/60 bg-emerald-950/60 text-emerald-300'
                  : 'border-amber-600/60 bg-amber-950/50 text-amber-300'
              }`}
            >
              {allowStudentDraw ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              <span>{allowStudentDraw ? 'Student Co-Draw: ON' : 'Student Co-Draw: Locked'}</span>
            </button>
          ) : (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${
                allowStudentDraw
                  ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}
            >
              {allowStudentDraw ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              <span>{allowStudentDraw ? 'Co-Draw Enabled' : 'View-Only'}</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveClassworkSnapshot}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
          >
            <Camera className="w-3 h-3" />
            <span>Save Classwork</span>
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            title="Download Slide PNG"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>PNG</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            title="Export Board Deck JSON"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium cursor-pointer"
          >
            <FileJson className="w-3 h-3" />
            <span className="hidden sm:inline">Deck</span>
          </button>

          <button
            type="button"
            aria-label={fullscreen ? 'Exit fullscreen board' : 'Expand board fullscreen'}
            onClick={() => setFullscreen(!fullscreen)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Primary Teaching Toolbar */}
      <div className="px-3.5 py-2 bg-[#161e2e] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 relative">
        {/* Tools Palette */}
        <div className="flex items-center gap-1 flex-wrap">
          {toolButtons.map((tb) => {
            const Icon = tb.icon;
            const active = !panMode && tool === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                title={tb.label}
                aria-label={tb.label}
                onClick={() => {
                  setPanMode(false);
                  setTool(tb.id);
                }}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}

          <div className="w-px h-6 bg-slate-700 mx-1" />

          {/* Pan Hand */}
          <button
            type="button"
            title="Pan Canvas"
            aria-label="Pan Canvas"
            onClick={() => setPanMode(!panMode)}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              panMode
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Hand className="w-4 h-4" />
          </button>

          {/* Math Symbols & Formula Drawer */}
          <button
            type="button"
            disabled={!canDraw}
            title="STEM Symbols & Formulas"
            onClick={() => {
              setShowSymbolDrawer(!showSymbolDrawer);
              setShowSlideImportDrawer(false);
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40 ${
              showSymbolDrawer
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Sigma className="w-3.5 h-3.5" />
            <span>Math / Sci</span>
          </button>

          {/* Quick Graph Stamp */}
          <button
            type="button"
            disabled={!canDraw}
            title="Insert Coordinate Axes"
            onClick={() => handleInsertGraph('axes')}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer disabled:opacity-40"
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Graph</span>
          </button>

          {/* Upload Image */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadImage}
            className="hidden"
          />
          <button
            type="button"
            disabled={!canDraw}
            title="Insert Diagram Image"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer disabled:opacity-40"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Image</span>
          </button>

          {/* Load Material Slide as Board Background */}
          {materials.length > 0 && (
            <button
              type="button"
              disabled={!canDraw}
              onClick={() => {
                setShowSlideImportDrawer(!showSlideImportDrawer);
                setShowSymbolDrawer(false);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40 ${
                showSlideImportDrawer
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-sky-300 hover:bg-slate-700'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Load Slide</span>
            </button>
          )}
        </div>

        {/* Color Swatches, Stroke Width, Undo/Redo, Clear */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 pr-2 border-r border-slate-700">
            {COLOR_SWATCHES.map((sw) => (
              <button
                key={sw.hex}
                type="button"
                aria-label={sw.label}
                title={sw.label}
                onClick={() => setColor(sw.hex)}
                style={{ backgroundColor: sw.hex }}
                className={`w-4 h-4 rounded-full border border-slate-500 cursor-pointer ${
                  color === sw.hex ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-[#161e2e]' : ''
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1 pr-2 border-r border-slate-700">
            {[2, 4, 7, 11].map((w) => (
              <button
                key={w}
                type="button"
                title={`Stroke ${w}px`}
                onClick={() => setStrokeWidth(w)}
                className={`w-6 h-6 rounded flex items-center justify-center cursor-pointer ${
                  strokeWidth === w ? 'bg-sky-600 text-white' : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span
                  className="rounded-full bg-current"
                  style={{ width: Math.min(12, w + 2), height: Math.min(12, w + 2) }}
                />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Undo (Ctrl+Z)"
              disabled={!canDraw || !canUndo}
              onClick={handleUndo}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Redo (Ctrl+Y)"
              disabled={!canDraw || !canRedo}
              onClick={handleRedo}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 cursor-pointer"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            {selectedId && (
              <button
                type="button"
                title="Delete Selected"
                onClick={handleDeleteSelected}
                className="p-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              disabled={!canDraw}
              onClick={handleClearSlide}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-700 text-slate-200 text-xs font-medium cursor-pointer disabled:opacity-35"
            >
              Clear Slide
            </button>
          </div>
        </div>

        {/* STEM Symbols & Graph Presets Dropdown Drawer */}
        {showSymbolDrawer && (
          <div className="absolute left-4 top-12 z-30 w-80 sm:w-96 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100">STEM Symbols, Formulas & Graphs</span>
              <button
                type="button"
                onClick={() => setShowSymbolDrawer(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STEM_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => handleInsertSymbolOrFormula(sym)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-sky-700 text-sm font-mono font-bold text-white cursor-pointer"
                >
                  {sym}
                </button>
              ))}
            </div>
            <div className="space-y-1.5 pt-1 border-t border-slate-800">
              <p className="text-[11px] font-semibold text-slate-400">Quick Formulas</p>
              <div className="grid grid-cols-1 gap-1.5">
                {STEM_FORMULAS.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => handleInsertSymbolOrFormula(f.formula)}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-700 text-left cursor-pointer"
                  >
                    <span className="text-slate-300">{f.label}</span>
                    <span className="font-mono text-sky-300 font-semibold">{f.formula}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 pt-1 border-t border-slate-800">
              <p className="text-[11px] font-semibold text-slate-400">Graph Plot Templates</p>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    handleInsertGraph('axes');
                    setShowSymbolDrawer(false);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-700 text-center cursor-pointer"
                >
                  XY Axes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleInsertGraph('parabola');
                    setShowSymbolDrawer(false);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-700 text-center cursor-pointer"
                >
                  Parabola
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleInsertGraph('sine');
                    setShowSymbolDrawer(false);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-700 text-center cursor-pointer"
                >
                  Sine Wave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Load Material Slide onto Board Drawer */}
        {showSlideImportDrawer && (
          <div className="absolute left-4 top-12 z-30 w-80 sm:w-96 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100">Load Session Slide onto Board</span>
              <button
                type="button"
                onClick={() => setShowSlideImportDrawer(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {materials.map((mat) => (
                <div key={mat.id} className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 space-y-1.5">
                  <p className="font-semibold text-slate-100 truncate">{mat.title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(mat.pages.length > 0 ? mat.pages : [{ pageNo: 1, heading: mat.title, subheading: '', bodyBullets: [] }]).map(
                      (pg, idx) => (
                        <button
                          key={pg.pageNo}
                          type="button"
                          onClick={() => handleStampMaterialPage(mat, idx)}
                          className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white text-[11px] font-medium cursor-pointer"
                        >
                          Load Page {pg.pageNo}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Board Stage */}
      <div
        className={`relative overflow-hidden bg-[#070a10] flex items-center justify-center ${
          fullscreen ? 'flex-1' : 'min-h-[380px] sm:min-h-[460px]'
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          className="relative w-full max-w-[1120px] aspect-video shadow-2xl transition-transform duration-75"
        >
          <canvas
            ref={canvasRef}
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`w-full h-full touch-none rounded-lg border border-slate-800 ${
              panMode
                ? 'cursor-grab active:cursor-grabbing'
                : tool === 'select'
                ? 'cursor-default'
                : tool === 'text'
                ? 'cursor-text'
                : 'cursor-crosshair'
            }`}
          />

          {/* Remote Participant Live Cursors */}
          {Object.values(remoteCursors).map((rc) => (
            <div
              key={rc.userId}
              style={{
                left: `${(rc.x / BOARD_WIDTH) * 100}%`,
                top: `${(rc.y / BOARD_HEIGHT) * 100}%`,
              }}
              className="pointer-events-none absolute -translate-x-1 -translate-y-1 z-20"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-900" />
              <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-bold whitespace-nowrap shadow">
                {rc.userName}
              </span>
            </div>
          ))}

          {/* Floating Text / Sticky Note Input Overlay */}
          {textDraft && (
            <div
              style={{
                left: `${Math.min(72, (textDraft.x / BOARD_WIDTH) * 100)}%`,
                top: `${Math.min(72, (textDraft.y / BOARD_HEIGHT) * 100)}%`,
              }}
              className="absolute z-30 w-64 rounded-xl border border-sky-500 bg-slate-900 p-2.5 shadow-2xl space-y-2"
            >
              <textarea
                autoFocus
                rows={3}
                value={textDraft.value}
                onChange={(e) =>
                  setTextDraft((prev) => (prev ? { ...prev, value: e.target.value } : null))
                }
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    commitTextDraft();
                  } else if (e.key === 'Escape') {
                    setTextDraft(null);
                  }
                }}
                placeholder={
                  textDraft.mode === 'sticky'
                    ? 'Write concept sticky note...'
                    : 'Type equation or label...'
                }
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTextDraft(null)}
                  className="px-2 py-1 rounded bg-slate-800 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitTextDraft}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>Place</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Floating Zoom Controls (Bottom Right) */}
        <div className="absolute right-3 bottom-3 z-20 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-xs">
          <button
            type="button"
            aria-label="Zoom out board"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
            className="p-1 rounded hover:bg-slate-800 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-1.5 font-mono text-[11px] hover:text-sky-400 cursor-pointer tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in board"
            onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
            className="p-1 rounded hover:bg-slate-800 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {statusNotice && (
          <div className="absolute left-3 bottom-3 z-20 px-3 py-1.5 rounded-lg bg-slate-900/95 border border-sky-600/60 text-[11px] text-sky-200 flex items-center gap-2 shadow-lg">
            <span>{statusNotice}</span>
            <button
              type="button"
              onClick={() => setStatusNotice('')}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Bottom Multi-Slide Deck Strip */}
      <div className="px-3.5 py-2 bg-[#121824] border-t border-slate-800 flex items-center justify-between gap-3 overflow-x-auto text-xs">
        <div className="flex items-center gap-1.5">
          {slides.map((sl, idx) => (
            <button
              key={sl.id}
              type="button"
              onClick={() => handleSwitchSlide(idx)}
              className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                idx === activeSlideIndex
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Slide {idx + 1}
              {sl.backgroundLabel ? ' · Slide' : ''}
            </button>
          ))}

          {canDraw && (
            <>
              <button
                type="button"
                onClick={handleAddSlide}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-600 text-slate-300 hover:border-sky-400 hover:text-white whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Slide</span>
              </button>
              <button
                type="button"
                title="Duplicate current slide"
                onClick={handleDuplicateSlide}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {slides.length > 1 && (
                <button
                  type="button"
                  title="Delete current slide"
                  onClick={handleDeleteSlide}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-700 text-slate-300 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>

        <span className="text-[11px] text-slate-400 whitespace-nowrap font-mono tabular-nums">
          {currentSlide.elements.length} objects · 1280×720
        </span>
      </div>
    </div>
  );
};
