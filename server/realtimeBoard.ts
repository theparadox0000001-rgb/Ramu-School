import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { db } from './db.ts';
import type { BoardElement, BoardSlide, PortalRole, SessionBoardState } from '../src/types/portal.ts';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  userName: string;
  userRole: PortalRole;
  roomId: string;
  color: string;
}

const rooms = new Map<string, Set<ConnectedClient>>();

const CURSOR_COLORS = ['#38BDF8', '#F59E0B', '#10B981', '#F43F5E', '#A78BFA', '#FB923C'];

function loadBoardFromDb(liveClassId: string): SessionBoardState | null {
  const row = db
    .prepare(
      'SELECT live_class_id, allow_student_draw, active_slide_index, slides_json, updated_at FROM session_boards WHERE live_class_id = ?'
    )
    .get(liveClassId) as
    | {
        live_class_id: string;
        allow_student_draw: number;
        active_slide_index: number;
        slides_json: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;
  let slides: BoardSlide[] = [];
  try {
    slides = JSON.parse(row.slides_json) as BoardSlide[];
  } catch {
    slides = [];
  }
  return {
    liveClassId: row.live_class_id,
    allowStudentDraw: Boolean(row.allow_student_draw),
    activeSlideIndex: Number(row.active_slide_index) || 0,
    slides:
      slides.length > 0
        ? slides
        : [
            {
              id: `slide-${liveClassId}-1`,
              title: '1. Main Board',
              theme: 'blackboard',
              grid: 'grid',
              elements: [],
            },
          ],
    updatedAt: row.updated_at,
  };
}

function saveBoardToDb(state: SessionBoardState): void {
  const safeIndex = Math.max(
    0,
    Math.min(state.activeSlideIndex, Math.max(0, state.slides.length - 1))
  );
  db.prepare(
    `INSERT INTO session_boards (live_class_id, allow_student_draw, active_slide_index, slides_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(live_class_id) DO UPDATE SET
       allow_student_draw = excluded.allow_student_draw,
       active_slide_index = excluded.active_slide_index,
       slides_json = excluded.slides_json,
       updated_at = datetime('now')`
  ).run(
    state.liveClassId,
    state.allowStudentDraw ? 1 : 0,
    safeIndex,
    JSON.stringify(state.slides)
  );
}

function broadcastToRoom(roomId: string, payload: unknown, except?: ConnectedClient): void {
  const peers = rooms.get(roomId);
  if (!peers) return;
  const serialized = JSON.stringify(payload);
  for (const peer of peers) {
    if (peer === except) continue;
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(serialized);
    }
  }
}

export function broadcastClassroomEvent(liveClassId: string, eventType: string, data: unknown): void {
  broadcastToRoom(liveClassId, { type: eventType, data });
}

function sendPresence(roomId: string): void {
  const peers = rooms.get(roomId);
  if (!peers) return;
  const users = Array.from(peers).map((p) => ({
    userId: p.userId,
    name: p.userName,
    role: p.userRole,
    color: p.color,
  }));
  broadcastToRoom(roomId, { type: 'presence:state', users });
}

function authenticateSocket(token: string | null): {
  id: string;
  name: string;
  role: PortalRole;
} | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as { id: string; name: string; role: PortalRole } | undefined;
  return row ?? null;
}

export function attachClassroomWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/classroom' });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/ws/classroom', 'http://localhost');
    const roomId = (reqUrl.searchParams.get('classId') || 'live-1').trim();
    const token = reqUrl.searchParams.get('token');
    const authUser = authenticateSocket(token);

    const client: ConnectedClient = {
      ws,
      userId: authUser?.id || `guest-${Date.now()}`,
      userName: authUser?.name || 'Classroom Guest',
      userRole: authUser?.role || 'student',
      roomId,
      color: CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)],
    };

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId)!.add(client);

    const initialBoard = loadBoardFromDb(roomId);
    if (initialBoard) {
      ws.send(JSON.stringify({ type: 'board:init', board: initialBoard }));
    }
    sendPresence(roomId);

    ws.on('message', (raw) => {
      let msg: {
        type?: string;
        slideIndex?: number;
        element?: BoardElement;
        elementId?: string;
        slide?: BoardSlide;
        slides?: BoardSlide[];
        allowStudentDraw?: boolean;
        patch?: Partial<BoardSlide>;
        points?: Array<{ x: number; y: number }>;
        x?: number;
        y?: number;
        color?: string;
      };
      try {
        msg = JSON.parse(String(raw)) as typeof msg;
      } catch {
        return;
      }

      const isEducator = client.userRole === 'teacher' || client.userRole === 'admin';

      // Ephemeral cursor / laser pointer broadcast
      if (msg.type === 'board:cursor' || msg.type === 'board:laser') {
        broadcastToRoom(
          roomId,
          {
            type: msg.type,
            userId: client.userId,
            userName: client.userName,
            color: msg.color || client.color,
            x: msg.x,
            y: msg.y,
            points: msg.points,
          },
          client
        );
        return;
      }

      const board = loadBoardFromDb(roomId);
      if (!board) return;

      const canDraw = isEducator || board.allowStudentDraw;

      if (msg.type === 'board:lock_toggle' && isEducator) {
        board.allowStudentDraw = Boolean(msg.allowStudentDraw);
        saveBoardToDb(board);
        broadcastToRoom(roomId, {
          type: 'board:lock_toggle',
          allowStudentDraw: board.allowStudentDraw,
        });
        return;
      }

      if (msg.type === 'board:slide_change' && isEducator && typeof msg.slideIndex === 'number') {
        board.activeSlideIndex = Math.max(0, Math.min(msg.slideIndex, board.slides.length - 1));
        saveBoardToDb(board);
        broadcastToRoom(
          roomId,
          { type: 'board:slide_change', slideIndex: board.activeSlideIndex },
          client
        );
        return;
      }

      if (!canDraw) {
        ws.send(
          JSON.stringify({
            type: 'board:error',
            message: 'Tutor has locked student drawing permissions.',
          })
        );
        return;
      }

      const slideIdx =
        typeof msg.slideIndex === 'number'
          ? Math.max(0, Math.min(msg.slideIndex, board.slides.length - 1))
          : board.activeSlideIndex;
      const targetSlide = board.slides[slideIdx];
      if (!targetSlide) return;

      if (msg.type === 'board:element_add' && msg.element) {
        // Idempotency guard per real-time guidelines
        if (!targetSlide.elements.some((el) => el.id === msg.element!.id)) {
          targetSlide.elements.push(msg.element);
          saveBoardToDb(board);
        }
        broadcastToRoom(
          roomId,
          { type: 'board:element_add', slideIndex: slideIdx, element: msg.element },
          client
        );
      } else if (msg.type === 'board:element_update' && msg.element) {
        targetSlide.elements = targetSlide.elements.map((el) =>
          el.id === msg.element!.id ? msg.element! : el
        );
        saveBoardToDb(board);
        broadcastToRoom(
          roomId,
          { type: 'board:element_update', slideIndex: slideIdx, element: msg.element },
          client
        );
      } else if (msg.type === 'board:element_delete' && msg.elementId) {
        targetSlide.elements = targetSlide.elements.filter((el) => el.id !== msg.elementId);
        saveBoardToDb(board);
        broadcastToRoom(
          roomId,
          { type: 'board:element_delete', slideIndex: slideIdx, elementId: msg.elementId },
          client
        );
      } else if (msg.type === 'board:slide_update' && msg.patch) {
        board.slides[slideIdx] = { ...targetSlide, ...msg.patch };
        saveBoardToDb(board);
        broadcastToRoom(
          roomId,
          { type: 'board:slide_update', slideIndex: slideIdx, patch: msg.patch },
          client
        );
      } else if (msg.type === 'board:clear' && isEducator) {
        targetSlide.elements = [];
        saveBoardToDb(board);
        broadcastToRoom(roomId, { type: 'board:clear', slideIndex: slideIdx }, client);
      } else if (msg.type === 'board:full_sync' && Array.isArray(msg.slides) && isEducator) {
        board.slides = msg.slides;
        if (typeof msg.slideIndex === 'number') {
          board.activeSlideIndex = msg.slideIndex;
        }
        saveBoardToDb(board);
        broadcastToRoom(roomId, { type: 'board:init', board }, client);
      }
    });

    ws.on('close', () => {
      const peers = rooms.get(roomId);
      if (peers) {
        peers.delete(client);
        if (peers.size === 0) {
          rooms.delete(roomId);
        } else {
          sendPresence(roomId);
        }
      }
    });
  });

  return wss;
}
