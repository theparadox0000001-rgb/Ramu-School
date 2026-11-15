import fs from 'node:fs';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  DB_PATH,
  db,
  generateSessionToken,
  hashPassword,
  verifyPassword,
} from './db.ts';
import {
  buildGamificationSummary,
  getRateLimiterStats,
  queryCache,
  recordLearningEvent,
} from './infra.ts';
import { broadcastClassroomEvent } from './realtimeBoard.ts';
import type {
  ActiveSessionInfo,
  AdminCommercePayload,
  AdminInjectPayload,
  AdminInjectResult,
  AdminUserRecord,
  AttendanceStudent,
  BatchCohort,
  ChapterItem,
  CommunityPost,
  CommunityReply,
  CouponItem,
  CourseItem,
  DifficultyLevel,
  DppSheetItem,
  EnrollmentItem,
  ExamTrack,
  FlashcardItem,
  FlashcardStatus,
  LeaderboardEntry,
  LessonItem,
  LiveClassItem,
  LoginMethod,
  MentorshipSession,
  MockTestTemplate,
  NcertSolutionItem,
  NotificationItem,
  OrderRecord,
  ParentDashboardPayload,
  PlatformConfig,
  PortalRole,
  QuestionItem,
  SavedDoubt,
  ScholarshipExam,
  SessionBoardState,
  SessionClassworkSnapshot,
  SessionMaterialItem,
  SessionPollItem,
  SessionQuizItem,
  SessionWorkspacePayload,
  StudentProfile,
  StudyTask,
  SubjectName,
  SupportTicket,
  SystemHealthMetrics,
  TeacherAssignment,
  TestAttemptRecord,
} from '../src/types/portal.ts';

interface AuthenticatedRequest extends Request {
  user?: StudentProfile;
  sessionToken?: string;
}

interface DbUserRow {
  id: string;
  role: PortalRole;
  name: string;
  initials: string;
  email: string | null;
  phone: string | null;
  admission_id: string | null;
  password_hash: string;
  dob_pin: string;
  track: ExamTrack;
  program_name: string;
  grade: string;
  daily_goal_hours: number;
  streak_days: number;
  weekly_hours_logged: number;
  avatar_url: string;
  login_method: LoginMethod;
  batch_id?: string | null;
  campus?: string | null;
  subjects_json?: string | null;
}

function normalizeRole(role?: string): PortalRole {
  if (role === 'admin') return 'admin';
  if (role === 'teacher') return 'teacher';
  if (role === 'parent') return 'parent';
  return 'student';
}

export function getPlatformConfig(): PlatformConfig {
  const cached = queryCache.get<PlatformConfig>('platform_config');
  if (cached) return cached;

  const row = db.prepare('SELECT * FROM platform_config WHERE id = 1').get() as
    | {
        institution_name: string;
        tagline: string;
        maintenance_mode: number;
        allow_public_signup: number;
        ai_mentor_enabled: number;
        marketplace_enabled: number;
        community_enabled: number;
        parent_portal_enabled: number;
        scholarship_open: number;
        max_sessions_per_user: number;
        updated_at: string;
      }
    | undefined;

  const cfg: PlatformConfig = row
    ? {
        institutionName: row.institution_name,
        tagline: row.tagline,
        maintenanceMode: row.maintenance_mode === 1,
        allowPublicSignup: row.allow_public_signup === 1,
        aiMentorEnabled: row.ai_mentor_enabled === 1,
        marketplaceEnabled: row.marketplace_enabled === 1,
        communityEnabled: row.community_enabled === 1,
        parentPortalEnabled: row.parent_portal_enabled === 1,
        scholarshipOpen: row.scholarship_open === 1,
        maxSessionsPerUser: row.max_sessions_per_user,
        updatedAt: row.updated_at,
      }
    : {
        institutionName: 'Ramu School',
        tagline: 'National EdTech & Competitive Exam Operating System',
        maintenanceMode: false,
        allowPublicSignup: true,
        aiMentorEnabled: true,
        marketplaceEnabled: true,
        communityEnabled: true,
        parentPortalEnabled: true,
        scholarshipOpen: true,
        maxSessionsPerUser: 5,
      };
  queryCache.set('platform_config', cfg, 10_000);
  return cfg;
}

function parseSubjects(raw?: string | null): SubjectName[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SubjectName[]) : [];
  } catch {
    return [];
  }
}

function rowToProfile(row: DbUserRow, overrideMethod?: LoginMethod): StudentProfile {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    email: row.email || '',
    phone: row.phone || '',
    admissionId: row.admission_id || '',
    track: row.track,
    programName: row.program_name,
    grade: row.grade,
    dailyGoalHours: row.daily_goal_hours,
    streakDays: row.streak_days,
    weeklyHoursLogged: row.weekly_hours_logged,
    avatarUrl: row.avatar_url,
    loginMethod: overrideMethod || row.login_method,
    role: normalizeRole(row.role),
    batchId: row.batch_id || undefined,
    campus: row.campus || undefined,
    subjects: parseSubjects(row.subjects_json),
  };
}

function createSessionForUser(userId: string, loginMethod: LoginMethod): string {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  db.prepare(
    'INSERT INTO sessions (token, user_id, login_method, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, loginMethod, expiresAt);
  db.prepare('UPDATE users SET login_method = ? WHERE id = ?').run(loginMethod, userId);

  // Enforce maxSessionsPerUser policy to keep concurrent session table bounded at 1L+ scale
  const maxSessions = Math.max(1, getPlatformConfig().maxSessionsPerUser || 5);
  const existing = db
    .prepare('SELECT token FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(userId) as Array<{ token: string }>;
  if (existing.length > maxSessions) {
    const del = db.prepare('DELETE FROM sessions WHERE token = ?');
    for (const stale of existing.slice(maxSessions)) {
      del.run(stale.token);
    }
  }
  return token;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return raw.trim();
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function computeInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'IL'
  );
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication token required.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT u.*, s.login_method AS session_method, s.expires_at AS session_expires
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as (DbUserRow & { session_method: LoginMethod; session_expires: string }) | undefined;

  if (!row || new Date(row.session_expires).getTime() < Date.now()) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  req.user = rowToProfile(row, row.session_method);
  req.sessionToken = token;
  next();
}

function requireTeacher(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== 'teacher' && req.user.role !== 'admin')) {
    res.status(403).json({ error: 'Faculty / Teacher permissions required for this action.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required for this operation.' });
    return;
  }
  next();
}

function logAdminAction(
  actor: StudentProfile,
  action: string,
  targetType: string,
  targetId: string,
  details: string
): void {
  db.prepare(
    `INSERT INTO admin_audit_logs (actor_name, actor_role, action, target_type, target_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(actor.name, actor.role, action, targetType, targetId, details);
}

export const apiRouter = express.Router();

// ============================================================================
// 1. AUTHENTICATION & USER PROFILE ENDPOINTS
// ============================================================================

apiRouter.post('/auth/otp/send', (req: Request, res: Response) => {
  const { phone = '', role = 'student' } = req.body as { phone?: string; role?: PortalRole };
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) {
    res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
    return;
  }
  const formatted = normalizePhone(digits);
  const code = '1234'; // Standard preview OTP; swap with SMS provider in production
  const expiresAt = Date.now() + 5 * 60 * 1000;
  db.prepare('INSERT INTO otp_challenges (phone, role, code, expires_at) VALUES (?, ?, ?, ?)').run(
    formatted,
    normalizeRole(role),
    code,
    expiresAt
  );
  res.json({ ok: true, phone: formatted, demoOtp: code });
});

apiRouter.post('/auth/otp/verify', (req: Request, res: Response) => {
  const {
    phone = '',
    otp = '',
    role = 'student',
    track = 'IIT-JEE',
    name = '',
    grade = 'Class 12',
  } = req.body as {
    phone?: string;
    otp?: string;
    role?: PortalRole;
    track?: ExamTrack;
    name?: string;
    grade?: string;
  };

  const formatted = normalizePhone(phone);
  const cleanOtp = otp.trim();
  if (cleanOtp.length < 4) {
    res.status(400).json({ error: 'Enter the 4-digit OTP verification code.' });
    return;
  }

  const challenge = db
    .prepare(
      'SELECT * FROM otp_challenges WHERE phone = ? ORDER BY id DESC LIMIT 1'
    )
    .get(formatted) as { code: string; expires_at: number } | undefined;

  if (challenge && challenge.expires_at < Date.now()) {
    res.status(400).json({ error: 'OTP expired. Please request a fresh verification code.' });
    return;
  }
  if (challenge && challenge.code !== cleanOtp && cleanOtp !== '1234') {
    res.status(401).json({ error: 'Incorrect OTP code. Use 1234 for preview verification.' });
    return;
  }

  const targetRole: PortalRole = normalizeRole(role);
  if (getPlatformConfig().maintenanceMode && targetRole !== 'admin') {
    res.status(503).json({
      error: 'Ramu School is currently in maintenance mode. Administrators can still sign in.',
    });
    return;
  }

  let userRow = db
    .prepare('SELECT * FROM users WHERE phone = ? AND role = ?')
    .get(formatted, targetRole) as DbUserRow | undefined;

  if (!userRow) {
    if (!getPlatformConfig().allowPublicSignup && targetRole === 'student') {
      res.status(403).json({ error: 'Public self-registration is currently disabled by Administrator.' });
      return;
    }
    // Allow seamless onboarding for new mobile users
    const idPrefix =
      targetRole === 'admin'
        ? 'IL-ADM'
        : targetRole === 'teacher'
        ? 'IL-FAC'
        : targetRole === 'parent'
        ? 'IL-PAR'
        : 'IL-STU';
    const id = `${idPrefix}-${Date.now()}`;
    const displayName =
      name.trim() ||
      (targetRole === 'admin'
        ? 'Raghavendra Rao'
        : targetRole === 'teacher'
        ? 'Ekansh Mishra'
        : targetRole === 'parent'
        ? 'Meera Sharma'
        : 'Ananya Sharma');
    const admissionId =
      targetRole === 'admin'
        ? `SC-ADM-${Math.floor(1000 + Math.random() * 9000)}`
        : targetRole === 'teacher'
        ? `SC-FAC-${Math.floor(1000 + Math.random() * 9000)}`
        : targetRole === 'parent'
        ? `SC-PAR-${Math.floor(1000 + Math.random() * 9000)}`
        : `SC-HYD-${Math.floor(1000 + Math.random() * 9000)}`;
    const programName =
      targetRole === 'admin'
        ? 'Ramu School Institutional Control Center'
        : targetRole === 'teacher'
        ? 'Ramu School Faculty Live Class Console'
        : targetRole === 'parent'
        ? 'Ramu School Parent Connect Portal'
        : track === 'IIT-JEE'
        ? 'IIT-JEE 2027 Comprehensive Program'
        : track === 'NEET UG'
        ? 'NEET UG 2027 Target Medical Program'
        : track === 'CBSE Class 12'
        ? 'CBSE Class 12 Board Excellence Program'
        : 'CBSE Grade 10 Science Full Program';

    db.prepare(
      `INSERT INTO users (
        id, role, name, initials, email, phone, admission_id, password_hash, dob_pin,
        track, program_name, grade, daily_goal_hours, streak_days, weekly_hours_logged,
        avatar_url, login_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      targetRole,
      displayName,
      computeInitials(displayName),
      `${id.toLowerCase()}@infinitylearn.com`,
      formatted,
      admissionId,
      hashPassword('Infinity@2027'),
      '2009-05-14',
      track,
      programName,
      targetRole === 'admin'
        ? 'Infinity Super Admin'
        : targetRole === 'teacher'
        ? 'Faculty Mentor'
        : grade,
      4,
      1,
      0,
      targetRole === 'teacher' || targetRole === 'admin'
        ? '/src/assets/images/mentor_physics_1794761540100.jpg'
        : '/src/assets/images/avatar_student_1794761540782.jpg',
      'otp'
    );
    userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as DbUserRow;
  }

  const token = createSessionForUser(userRow.id, 'otp');
  res.json({ token, user: rowToProfile(userRow, 'otp') });
});

apiRouter.post('/auth/login/password', (req: Request, res: Response) => {
  const {
    identifier = '',
    password = '',
    role = 'student',
    track,
  } = req.body as {
    identifier?: string;
    password?: string;
    role?: PortalRole;
    track?: ExamTrack;
  };

  const cleanId = identifier.trim().toLowerCase();
  if (!cleanId || password.length < 4) {
    res.status(400).json({ error: 'Please enter both your registered email/ID and password.' });
    return;
  }

  const targetRole: PortalRole = normalizeRole(role);
  if (getPlatformConfig().maintenanceMode && targetRole !== 'admin') {
    res.status(503).json({
      error: 'Ramu School is currently in maintenance mode. Administrators can still sign in.',
    });
    return;
  }

  const userRow = db
    .prepare(
      `SELECT * FROM users
       WHERE (LOWER(email) = ? OR LOWER(admission_id) = ?) AND role = ?`
    )
    .get(cleanId, cleanId, targetRole) as DbUserRow | undefined;

  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    res.status(401).json({
      error:
        'Invalid credentials. Seeded accounts use password Infinity@2027 or use Sign Up to create a new account.',
    });
    return;
  }

  if (track && targetRole === 'student') {
    db.prepare('UPDATE users SET track = ? WHERE id = ?').run(track, userRow.id);
    userRow.track = track;
  }

  const token = createSessionForUser(userRow.id, 'password');
  res.json({ token, user: rowToProfile(userRow, 'password') });
});

apiRouter.post('/auth/login/id', (req: Request, res: Response) => {
  const {
    admissionId = '',
    dobPin = '',
    role = 'student',
    track,
  } = req.body as {
    admissionId?: string;
    dobPin?: string;
    role?: PortalRole;
    track?: ExamTrack;
  };

  const cleanCode = admissionId.trim().toUpperCase();
  if (!cleanCode || !dobPin.trim()) {
    res.status(400).json({ error: 'Enter your Admission / Faculty ID and Date of Birth.' });
    return;
  }

  const targetRole: PortalRole = normalizeRole(role);
  if (getPlatformConfig().maintenanceMode && targetRole !== 'admin') {
    res.status(503).json({
      error: 'Ramu School is currently in maintenance mode. Administrators can still sign in.',
    });
    return;
  }

  const userRow = db
    .prepare('SELECT * FROM users WHERE UPPER(admission_id) = ? AND role = ?')
    .get(cleanCode, targetRole) as DbUserRow | undefined;

  if (!userRow) {
    res.status(401).json({
      error:
        targetRole === 'admin'
          ? 'Admin Staff ID not found. Use SC-ADM-2026-001 for demo admin.'
          : targetRole === 'teacher'
          ? 'Faculty ID not found. Use SC-FAC-2026-118 for demo faculty.'
          : targetRole === 'parent'
          ? 'Parent ID not found. Use SC-PAR-2026-001 for demo parent.'
          : 'Admission ID not found. Use SC-HYD-26-4419 for demo student.',
    });
    return;
  }

  if (userRow.dob_pin !== dobPin.trim()) {
    res.status(401).json({ error: 'Date of Birth / Campus PIN does not match our records.' });
    return;
  }

  if (track && targetRole === 'student') {
    db.prepare('UPDATE users SET track = ? WHERE id = ?').run(track, userRow.id);
    userRow.track = track;
  }

  const token = createSessionForUser(userRow.id, 'admission');
  res.json({ token, user: rowToProfile(userRow, 'admission') });
});

apiRouter.post('/auth/register', (req: Request, res: Response) => {
  const {
    name = '',
    email = '',
    phone = '',
    password = '',
    role = 'student',
    track = 'IIT-JEE',
    grade = 'Class 12',
  } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    role?: PortalRole;
    track?: ExamTrack;
    grade?: string;
  };

  if (!name.trim() || (!email.trim() && !phone.trim()) || password.length < 4) {
    res
      .status(400)
      .json({ error: 'Full name, email or phone, and a password (min 4 chars) are required.' });
    return;
  }

  if (!getPlatformConfig().allowPublicSignup) {
    res.status(403).json({ error: 'Public account sign-up is currently paused by Administrator.' });
    return;
  }

  const targetRole: PortalRole = role === 'teacher' ? 'teacher' : role === 'parent' ? 'parent' : 'student';
  const cleanEmail = email.trim().toLowerCase() || null;
  const formattedPhone = phone.trim() ? normalizePhone(phone) : null;

  const conflict = db
    .prepare('SELECT id FROM users WHERE (email IS NOT NULL AND LOWER(email) = ?) OR (phone IS NOT NULL AND phone = ?)')
    .get(cleanEmail || '', formattedPhone || '') as { id: string } | undefined;

  if (conflict) {
    res.status(409).json({ error: 'An account with this email or mobile number already exists.' });
    return;
  }

  const id = `${targetRole === 'teacher' ? 'IL-FAC' : 'IL-STU'}-${Date.now()}`;
  const admissionId =
    targetRole === 'teacher'
      ? `SC-FAC-${Math.floor(1000 + Math.random() * 9000)}`
      : `SC-HYD-${Math.floor(1000 + Math.random() * 9000)}`;
  const programName =
    targetRole === 'teacher'
      ? 'Sri Chaitanya Faculty Live Class Console'
      : track === 'IIT-JEE'
      ? 'IIT-JEE 2027 Comprehensive Program'
      : track === 'NEET UG'
      ? 'NEET UG 2027 Target Medical Program'
      : track === 'CBSE Class 12'
      ? 'CBSE Class 12 Board Excellence Program'
      : 'CBSE Grade 10 Science Full Program';

  db.prepare(
    `INSERT INTO users (
      id, role, name, initials, email, phone, admission_id, password_hash, dob_pin,
      track, program_name, grade, daily_goal_hours, streak_days, weekly_hours_logged,
      avatar_url, login_method
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    targetRole,
    name.trim(),
    computeInitials(name),
    cleanEmail,
    formattedPhone,
    admissionId,
    hashPassword(password),
    '2009-05-14',
    track,
    programName,
    targetRole === 'teacher' ? 'Faculty Mentor' : grade,
    4,
    1,
    0,
    targetRole === 'teacher'
      ? '/src/assets/images/mentor_physics_1794761540100.jpg'
      : '/src/assets/images/avatar_student_1794761540782.jpg',
    'password'
  );

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as DbUserRow;
  const token = createSessionForUser(userRow.id, 'password');
  res.status(201).json({ token, user: rowToProfile(userRow, 'password') });
});

apiRouter.post('/auth/demo', (req: Request, res: Response) => {
  const { role = 'student', track } = req.body as { role?: PortalRole; track?: ExamTrack };
  const targetRole: PortalRole = normalizeRole(role);
  if (getPlatformConfig().maintenanceMode && targetRole !== 'admin') {
    res.status(503).json({
      error: 'Ramu School is currently in maintenance mode. Administrators can still sign in.',
    });
    return;
  }
  const userRow = db
    .prepare('SELECT * FROM users WHERE role = ? ORDER BY created_at ASC LIMIT 1')
    .get(targetRole) as DbUserRow | undefined;

  if (!userRow) {
    res.status(404).json({ error: 'Seeded demo account not available.' });
    return;
  }

  if (track && targetRole === 'student') {
    const programName =
      track === 'IIT-JEE'
        ? 'IIT-JEE 2027 Comprehensive Program'
        : track === 'NEET UG'
        ? 'NEET UG 2027 Target Medical Program'
        : track === 'CBSE Class 12'
        ? 'CBSE Class 12 Board Excellence Program'
        : 'CBSE Grade 10 Science Full Program';
    db.prepare('UPDATE users SET track = ?, program_name = ? WHERE id = ?').run(
      track,
      programName,
      userRow.id
    );
    userRow.track = track;
    userRow.program_name = programName;
  }

  const token = createSessionForUser(
    userRow.id,
    targetRole === 'student' ? 'otp' : 'password'
  );
  res.json({ token, user: rowToProfile(userRow) });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

apiRouter.patch('/auth/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const body = req.body as Partial<StudentProfile>;
  const nextName = (body.name ?? user.name).trim() || user.name;
  const nextInitials = computeInitials(nextName);
  const nextTrack = body.track ?? user.track;
  const nextProgram = body.programName ?? user.programName;
  const nextGrade = body.grade ?? user.grade;
  const nextGoal = typeof body.dailyGoalHours === 'number' ? body.dailyGoalHours : user.dailyGoalHours;

  db.prepare(
    `UPDATE users
     SET name = ?, initials = ?, track = ?, program_name = ?, grade = ?, daily_goal_hours = ?
     WHERE id = ?`
  ).run(nextName, nextInitials, nextTrack, nextProgram, nextGrade, nextGoal, user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as DbUserRow;
  res.json({ user: rowToProfile(updated, user.loginMethod) });
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.sessionToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  }
  res.json({ ok: true });
});

// ============================================================================
// 2. WORKSPACE HYDRATION & STUDENT DATA SPACES
// ============================================================================

function buildBootstrapPayload(userId: string) {
  // Chapters + Lessons merged with user progress
  const chapterRows = db
    .prepare('SELECT * FROM chapters ORDER BY sort_order ASC, rowid ASC')
    .all() as Array<{
    id: string;
    subject: SubjectName;
    title: string;
    unit: string;
    weightage: string;
    mastery_percent: number;
  }>;

  const lessonRows = db
    .prepare(
      `SELECT l.*, ulp.completed AS user_completed, ulp.bookmarked AS user_bookmarked
       FROM lessons l
       LEFT JOIN user_lesson_progress ulp ON ulp.lesson_id = l.id AND ulp.user_id = ?
       ORDER BY l.sort_order ASC, l.rowid ASC`
    )
    .all(userId) as Array<{
    id: string;
    chapter_id: string;
    title: string;
    duration_min: number;
    type: 'video' | 'notes' | 'practice';
    instructor: string;
    summary: string;
    key_formulas_json: string;
    timestamps_json: string;
    notes_content: string;
    default_completed: number;
    default_bookmarked: number;
    user_completed: number | null;
    user_bookmarked: number | null;
  }>;

  const lessonsByChapter = new Map<string, LessonItem[]>();
  for (const l of lessonRows) {
    const completed = l.user_completed !== null ? l.user_completed === 1 : l.default_completed === 1;
    const bookmarked =
      l.user_bookmarked !== null ? l.user_bookmarked === 1 : l.default_bookmarked === 1;
    const item: LessonItem = {
      id: l.id,
      title: l.title,
      durationMin: l.duration_min,
      type: l.type,
      completed,
      bookmarked,
      instructor: l.instructor,
      summary: l.summary,
      keyFormulas: JSON.parse(l.key_formulas_json) as string[],
      timestamps: JSON.parse(l.timestamps_json) as Array<{ time: string; label: string }>,
      notesContent: l.notes_content,
    };
    const arr = lessonsByChapter.get(l.chapter_id) || [];
    arr.push(item);
    lessonsByChapter.set(l.chapter_id, arr);
  }

  const chapters: ChapterItem[] = chapterRows.map((c) => {
    const lessons = lessonsByChapter.get(c.id) || [];
    const done = lessons.filter((l) => l.completed).length;
    const masteryPercent = lessons.length > 0 ? Math.round((done / lessons.length) * 100) : c.mastery_percent;
    return {
      id: c.id,
      subject: c.subject,
      title: c.title,
      unit: c.unit,
      weightage: c.weightage,
      masteryPercent,
      lessons,
    };
  });

  // Live classes with user reminders
  const liveRows = db
    .prepare(
      `SELECT lc.*, ulr.reminded AS user_reminded
       FROM live_classes lc
       LEFT JOIN user_live_reminders ulr ON ulr.live_class_id = lc.id AND ulr.user_id = ?
       ORDER BY lc.created_at DESC, lc.rowid ASC`
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    subject: SubjectName;
    instructor: string;
    instructor_role: string;
    instructor_avatar: string;
    status: 'live' | 'upcoming' | 'recorded';
    scheduled_time: string;
    date_label: string;
    time_range: string;
    grade_label: string;
    language: string;
    track: ExamTrack;
    chapter: string;
    attendees_count: number;
    whiteboard_notes_json: string;
    poll_question_json: string;
    user_reminded: number | null;
  }>;

  const liveClasses: LiveClassItem[] = liveRows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subject,
    instructor: r.instructor,
    instructorRole: r.instructor_role,
    instructorAvatar: r.instructor_avatar,
    status: r.status,
    scheduledTime: r.scheduled_time,
    dateLabel: r.date_label,
    timeRange: r.time_range,
    gradeLabel: r.grade_label,
    language: r.language,
    track: r.track,
    chapter: r.chapter,
    reminded: r.user_reminded === 1,
    attendeesCount: r.attendees_count,
    whiteboardNotes: JSON.parse(r.whiteboard_notes_json) as string[],
    pollQuestion: JSON.parse(r.poll_question_json) as LiveClassItem['pollQuestion'],
  }));

  // Questions
  const questionRows = db.prepare('SELECT * FROM questions ORDER BY rowid ASC').all() as Array<{
    id: string;
    subject: SubjectName;
    chapter_id: string;
    chapter_title: string;
    difficulty: DifficultyLevel;
    prompt: string;
    options_json: string;
    correct_index: number;
    explanation: string;
    formula_used: string;
    avg_time_sec: number;
  }>;

  const questions: QuestionItem[] = questionRows.map((q) => ({
    id: q.id,
    subject: q.subject,
    chapterId: q.chapter_id,
    chapterTitle: q.chapter_title,
    difficulty: q.difficulty,
    prompt: q.prompt,
    options: JSON.parse(q.options_json) as [string, string, string, string],
    correctIndex: q.correct_index,
    explanation: q.explanation,
    formulaUsed: q.formula_used,
    avgTimeSec: q.avg_time_sec,
  }));

  // Mock Tests
  const mockRows = db.prepare('SELECT * FROM mock_tests ORDER BY rowid ASC').all() as Array<{
    id: string;
    title: string;
    category: MockTestTemplate['category'];
    subjects_json: string;
    duration_min: number;
    total_marks: number;
    negative_marking: number;
    difficulty: DifficultyLevel;
    question_ids_json: string;
  }>;

  const mockTests: MockTestTemplate[] = mockRows.map((m) => ({
    id: m.id,
    title: m.title,
    category: m.category,
    subjects: JSON.parse(m.subjects_json) as SubjectName[],
    durationMin: m.duration_min,
    totalMarks: m.total_marks,
    negativeMarking: m.negative_marking === 1,
    difficulty: m.difficulty,
    questionIds: JSON.parse(m.question_ids_json) as string[],
  }));

  // User Test Attempts
  const attemptRows = db
    .prepare('SELECT * FROM test_attempts WHERE user_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(userId) as Array<{
    id: string;
    test_title: string;
    category: string;
    date_label: string;
    score: number;
    max_score: number;
    accuracy_percent: number;
    time_spent_min: number;
    correct_count: number;
    incorrect_count: number;
    unattempted_count: number;
    subject_breakdown_json: string;
    responses_json: string | null;
    question_ids_json: string | null;
  }>;

  const testHistory: TestAttemptRecord[] = attemptRows.map((a) => ({
    id: a.id,
    testTitle: a.test_title,
    category: a.category,
    dateLabel: a.date_label,
    score: a.score,
    maxScore: a.max_score,
    accuracyPercent: a.accuracy_percent,
    timeSpentMin: a.time_spent_min,
    correctCount: a.correct_count,
    incorrectCount: a.incorrect_count,
    unattemptedCount: a.unattempted_count,
    subjectBreakdown: JSON.parse(a.subject_breakdown_json) as TestAttemptRecord['subjectBreakdown'],
    responses: a.responses_json ? (JSON.parse(a.responses_json) as Record<string, number | null>) : undefined,
    questionIds: a.question_ids_json ? (JSON.parse(a.question_ids_json) as string[]) : undefined,
  }));

  // Error Log IDs
  const errorLogRows = db
    .prepare('SELECT question_id FROM user_error_log WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as Array<{ question_id: string }>;
  const errorLogIds = errorLogRows.map((r) => r.question_id);

  // DPP Sheets + User Progress
  const dppRows = db
    .prepare(
      `SELECT d.*, udp.completed AS user_completed
       FROM dpp_sheets d
       LEFT JOIN user_dpp_progress udp ON udp.dpp_id = d.id AND udp.user_id = ?
       ORDER BY d.rowid ASC`
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    subject: SubjectName;
    date_label: string;
    estimated_min: number;
    question_ids_json: string;
    user_completed: number | null;
  }>;

  const dppSheets: DppSheetItem[] = dppRows.map((d) => ({
    id: d.id,
    title: d.title,
    subject: d.subject,
    dateLabel: d.date_label,
    estimatedMin: d.estimated_min,
    questionIds: JSON.parse(d.question_ids_json) as string[],
    completed: d.user_completed === 1,
  }));

  // NCERT Solutions
  const ncertRows = db.prepare('SELECT * FROM ncert_solutions ORDER BY rowid ASC').all() as Array<{
    id: string;
    subject: SubjectName;
    chapter: string;
    exercise_ref: string;
    question: string;
    solution_steps_json: string;
    final_answer: string;
  }>;
  const ncertSolutions: NcertSolutionItem[] = ncertRows.map((n) => ({
    id: n.id,
    subject: n.subject,
    chapter: n.chapter,
    exerciseRef: n.exercise_ref,
    question: n.question,
    solutionSteps: JSON.parse(n.solution_steps_json) as string[],
    finalAnswer: n.final_answer,
  }));

  // Flashcards + User Progress
  const flashRows = db
    .prepare(
      `SELECT f.*, ufp.status AS user_status, ufp.bookmarked AS user_bookmarked
       FROM flashcards f
       LEFT JOIN user_flashcard_progress ufp ON ufp.flashcard_id = f.id AND ufp.user_id = ?
       ORDER BY f.rowid ASC`
    )
    .all(userId) as Array<{
    id: string;
    subject: SubjectName;
    chapter: string;
    front: string;
    hint: string;
    back: string;
    formula: string;
    default_status: FlashcardStatus;
    default_bookmarked: number;
    user_status: FlashcardStatus | null;
    user_bookmarked: number | null;
  }>;

  const flashcards: FlashcardItem[] = flashRows.map((f) => ({
    id: f.id,
    subject: f.subject,
    chapter: f.chapter,
    front: f.front,
    hint: f.hint,
    back: f.back,
    formula: f.formula,
    status: f.user_status || f.default_status,
    bookmarked: f.user_bookmarked !== null ? f.user_bookmarked === 1 : f.default_bookmarked === 1,
  }));

  // Study Tasks
  const taskRows = db
    .prepare('SELECT * FROM study_tasks WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(userId) as Array<{
    id: string;
    title: string;
    subject: SubjectName;
    day: StudyTask['day'];
    duration_min: number;
    completed: number;
  }>;
  const tasks: StudyTask[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    subject: t.subject,
    day: t.day,
    durationMin: t.duration_min,
    completed: t.completed === 1,
  }));

  // Saved Doubts
  const doubtRows = db
    .prepare('SELECT * FROM saved_doubts WHERE user_id = ? ORDER BY rowid DESC')
    .all(userId) as Array<{
    id: string;
    subject: SubjectName;
    question: string;
    answer: string;
    mode: 'hint' | 'full';
    created_at: string;
  }>;
  const savedDoubts: SavedDoubt[] = doubtRows.map((d) => ({
    id: d.id,
    subject: d.subject,
    question: d.question,
    answer: d.answer,
    mode: d.mode,
    createdAt: d.created_at,
  }));

  // Support Tickets
  const ticketRows = db
    .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY rowid DESC')
    .all(userId) as Array<{
    id: string;
    category: string;
    subject: string;
    message: string;
    status: 'Open' | 'Resolved';
    created_at: string;
  }>;
  const tickets: SupportTicket[] = ticketRows.map((t) => ({
    id: t.id,
    category: t.category,
    subject: t.subject,
    message: t.message,
    status: t.status,
    createdAt: t.created_at,
  }));

  // Leaderboard
  const lbRows = db.prepare('SELECT * FROM leaderboard_entries ORDER BY rank ASC').all() as Array<{
    rank: number;
    name: string;
    city: string;
    track: ExamTrack;
    tests_taken: number;
    accuracy_percent: number;
    score_points: number;
    user_id: string | null;
  }>;
  const leaderboard: LeaderboardEntry[] = lbRows.map((lb) => ({
    rank: lb.rank,
    name: lb.name,
    city: lb.city,
    track: lb.track,
    testsTaken: lb.tests_taken,
    accuracyPercent: lb.accuracy_percent,
    scorePoints: lb.score_points,
    isCurrentUser: lb.user_id === userId,
  }));

  // Teacher Assignments & Attendance
  const assignmentRows = db
    .prepare('SELECT * FROM teacher_assignments ORDER BY created_at DESC, rowid ASC')
    .all() as Array<{
    id: string;
    title: string;
    subject: SubjectName;
    grade_label: string;
    due_date: string;
    submitted_count: number;
    total_students: number;
    status: 'Active' | 'Graded';
  }>;
  const teacherAssignments: TeacherAssignment[] = assignmentRows.map((a) => ({
    id: a.id,
    title: a.title,
    subject: a.subject,
    gradeLabel: a.grade_label,
    dueDate: a.due_date,
    submittedCount: a.submitted_count,
    totalStudents: a.total_students,
    status: a.status,
  }));

  const rosterRows = db.prepare('SELECT * FROM attendance_roster ORDER BY roll_no ASC').all() as Array<{
    id: string;
    name: string;
    roll_no: string;
    status: AttendanceStudent['status'];
  }>;
  const attendanceRoster: AttendanceStudent[] = rosterRows.map((r) => ({
    id: r.id,
    name: r.name,
    rollNo: r.roll_no,
    status: r.status,
  }));

  const userMeta = db.prepare('SELECT streak_days FROM users WHERE id = ?').get(userId) as
    | { streak_days: number }
    | undefined;
  const platformConfig = getPlatformConfig();
  const notifRows = db
    .prepare(
      `SELECT * FROM notifications
       WHERE user_id = ? OR user_id = 'ALL'
       ORDER BY rowid DESC LIMIT 30`
    )
    .all(userId) as Array<{
    id: string;
    user_id: string;
    title: string;
    body: string;
    category: NotificationItem['category'];
    is_read: number;
    created_at: string;
  }>;
  const notifications: NotificationItem[] = notifRows.map((n) => ({
    id: n.id,
    userId: n.user_id,
    title: n.title,
    body: n.body,
    category: n.category,
    isRead: n.is_read === 1,
    createdAt: n.created_at,
  }));

  const enrollmentRows = db
    .prepare('SELECT * FROM enrollments WHERE user_id = ? ORDER BY rowid DESC')
    .all(userId) as Array<{
    id: string;
    user_id: string;
    course_id: string;
    course_title: string;
    status: EnrollmentItem['status'];
    valid_until: string;
    progress_percent: number;
    enrolled_at: string;
  }>;
  const enrollments: EnrollmentItem[] = enrollmentRows.map((e) => ({
    id: e.id,
    userId: e.user_id,
    courseId: e.course_id,
    courseTitle: e.course_title,
    status: e.status,
    validUntil: e.valid_until,
    progressPercent: e.progress_percent,
    enrolledAt: e.enrolled_at,
  }));

  const gamification = buildGamificationSummary(db, userId, userMeta?.streak_days ?? 7);

  return {
    chapters,
    liveClasses,
    questions,
    mockTests,
    testHistory,
    errorLogIds,
    dppSheets,
    ncertSolutions,
    flashcards,
    tasks,
    savedDoubts,
    tickets,
    leaderboard,
    teacherAssignments,
    attendanceRoster,
    platformConfig,
    notifications,
    enrollments,
    gamification,
  };
}

apiRouter.get('/workspace/bootstrap', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const payload = buildBootstrapPayload(req.user!.id);
  res.json({ user: req.user, ...payload });
});

// Lesson progress & bookmark
apiRouter.post('/lessons/:lessonId/progress', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { lessonId } = req.params;
  const { completed, bookmarked } = req.body as { completed?: boolean; bookmarked?: boolean };

  const existing = db
    .prepare('SELECT completed, bookmarked FROM user_lesson_progress WHERE user_id = ? AND lesson_id = ?')
    .get(userId, lessonId) as { completed: number; bookmarked: number } | undefined;

  const lessonDefault = db
    .prepare('SELECT default_completed, default_bookmarked FROM lessons WHERE id = ?')
    .get(lessonId) as { default_completed: number; default_bookmarked: number } | undefined;

  if (!lessonDefault) {
    res.status(404).json({ error: 'Lesson not found.' });
    return;
  }

  const nextCompleted =
    typeof completed === 'boolean'
      ? completed
        ? 1
        : 0
      : existing
      ? existing.completed
      : lessonDefault.default_completed;
  const nextBookmarked =
    typeof bookmarked === 'boolean'
      ? bookmarked
        ? 1
        : 0
      : existing
      ? existing.bookmarked
      : lessonDefault.default_bookmarked;

  db.prepare(
    `INSERT INTO user_lesson_progress (user_id, lesson_id, completed, bookmarked, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET
       completed = excluded.completed,
       bookmarked = excluded.bookmarked,
       updated_at = datetime('now')`
  ).run(userId, lessonId, nextCompleted, nextBookmarked);

  if (nextCompleted === 1 && (!existing || existing.completed === 0)) {
    recordLearningEvent(db, userId, 'LESSON_COMPLETED', 'lesson', lessonId, 25);
  }
  res.json({ ok: true, completed: nextCompleted === 1, bookmarked: nextBookmarked === 1 });
});

// DPP progress
apiRouter.post('/dpp/:dppId/progress', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { dppId } = req.params;
  const { completed, answers } = req.body as {
    completed: boolean;
    answers?: Record<string, number>;
  };

  db.prepare(
    `INSERT INTO user_dpp_progress (user_id, dpp_id, completed, answers_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, dpp_id) DO UPDATE SET
       completed = excluded.completed,
       answers_json = COALESCE(excluded.answers_json, user_dpp_progress.answers_json),
       updated_at = datetime('now')`
  ).run(userId, dppId, completed ? 1 : 0, answers ? JSON.stringify(answers) : null);

  if (completed) {
    recordLearningEvent(db, userId, 'DPP_COMPLETED', 'dpp', dppId, 30);
  }
  res.json({ ok: true });
});

// Live Class Reminder, Chat & Poll
apiRouter.post('/live-classes/:id/reminder', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { reminded } = req.body as { reminded: boolean };
  db.prepare(
    `INSERT INTO user_live_reminders (user_id, live_class_id, reminded)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, live_class_id) DO UPDATE SET reminded = excluded.reminded`
  ).run(userId, id, reminded ? 1 : 0);
  res.json({ ok: true, reminded: Boolean(reminded) });
});

apiRouter.get('/live-classes/:id/chat', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const messages = db
    .prepare('SELECT author, text, created_at FROM live_class_chat WHERE live_class_id = ? ORDER BY id ASC')
    .all(id) as Array<{ author: string; text: string; created_at: string }>;
  res.json({ messages });
});

apiRouter.post('/live-classes/:id/chat', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { text = '' } = req.body as { text?: string };
  if (!text.trim()) {
    res.status(400).json({ error: 'Message cannot be empty.' });
    return;
  }
  const author = req.user!.role === 'teacher' ? `${req.user!.name} (Faculty)` : req.user!.name;
  db.prepare('INSERT INTO live_class_chat (live_class_id, author, text) VALUES (?, ?, ?)').run(
    id,
    author,
    text.trim()
  );
  broadcastClassroomEvent(id, 'chat:new', { author, text: text.trim() });
  res.status(201).json({ author, text: text.trim() });
});

apiRouter.post('/live-classes/:id/poll', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { optionId } = req.body as { optionId?: string };
  if (!optionId) {
    res.status(400).json({ error: 'optionId is required.' });
    return;
  }
  db.prepare(
    `INSERT INTO live_class_poll_votes (user_id, live_class_id, option_id)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, live_class_id) DO UPDATE SET option_id = excluded.option_id`
  ).run(userId, id, optionId);
  broadcastClassroomEvent(id, 'poll:vote', { optionId, userId });
  res.json({ ok: true, optionId });
});

// Test Attempts & Automatic Error Log Sync
apiRouter.post('/tests/attempts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const attempt = req.body as TestAttemptRecord;
  if (!attempt || !attempt.id || !attempt.testTitle) {
    res.status(400).json({ error: 'Invalid test attempt payload.' });
    return;
  }

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO test_attempts (
        id, user_id, test_title, category, date_label, score, max_score, accuracy_percent,
        time_spent_min, correct_count, incorrect_count, unattempted_count, subject_breakdown_json,
        responses_json, question_ids_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      attempt.id,
      userId,
      attempt.testTitle,
      attempt.category,
      attempt.dateLabel,
      attempt.score,
      attempt.maxScore,
      attempt.accuracyPercent,
      attempt.timeSpentMin,
      attempt.correctCount,
      attempt.incorrectCount,
      attempt.unattemptedCount,
      JSON.stringify(attempt.subjectBreakdown || []),
      attempt.responses ? JSON.stringify(attempt.responses) : null,
      attempt.questionIds ? JSON.stringify(attempt.questionIds) : null
    );

    if (attempt.questionIds && attempt.responses) {
      const qRows = db.prepare('SELECT id, correct_index FROM questions').all() as Array<{
        id: string;
        correct_index: number;
      }>;
      const answerMap = new Map(qRows.map((q) => [q.id, q.correct_index]));
      const delErr = db.prepare('DELETE FROM user_error_log WHERE user_id = ? AND question_id = ?');
      const addErr = db.prepare(
        'INSERT OR IGNORE INTO user_error_log (user_id, question_id) VALUES (?, ?)'
      );

      for (const qid of attempt.questionIds) {
        const userAns = attempt.responses[qid];
        const correctIdx = answerMap.get(qid);
        if (correctIdx === undefined) continue;
        if (userAns === correctIdx) {
          delErr.run(userId, qid);
        } else if (userAns !== undefined && userAns !== null) {
          addErr.run(userId, qid);
        }
      }
    }

    db.exec('COMMIT');
    recordLearningEvent(db, userId, 'TEST_SUBMITTED', 'test_attempt', attempt.id, 60, {
      accuracy: attempt.accuracyPercent,
    });
    res.status(201).json({ ok: true, attempt });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

apiRouter.delete(
  '/tests/error-log/:questionId',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    db.prepare('DELETE FROM user_error_log WHERE user_id = ? AND question_id = ?').run(
      req.user!.id,
      req.params.questionId
    );
    res.json({ ok: true });
  }
);

// Flashcards Progress
apiRouter.post('/flashcards/:id/progress', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { status, bookmarked } = req.body as { status?: FlashcardStatus; bookmarked?: boolean };

  const fc = db
    .prepare('SELECT default_status, default_bookmarked FROM flashcards WHERE id = ?')
    .get(id) as { default_status: FlashcardStatus; default_bookmarked: number } | undefined;
  if (!fc) {
    res.status(404).json({ error: 'Flashcard not found.' });
    return;
  }

  const existing = db
    .prepare('SELECT status, bookmarked FROM user_flashcard_progress WHERE user_id = ? AND flashcard_id = ?')
    .get(userId, id) as { status: FlashcardStatus; bookmarked: number } | undefined;

  const nextStatus = status || existing?.status || fc.default_status;
  const nextBookmarked =
    typeof bookmarked === 'boolean'
      ? bookmarked
        ? 1
        : 0
      : existing
      ? existing.bookmarked
      : fc.default_bookmarked;

  db.prepare(
    `INSERT INTO user_flashcard_progress (user_id, flashcard_id, status, bookmarked)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, flashcard_id) DO UPDATE SET
       status = excluded.status,
       bookmarked = excluded.bookmarked`
  ).run(userId, id, nextStatus, nextBookmarked);

  res.json({ ok: true, status: nextStatus, bookmarked: nextBookmarked === 1 });
});

// Study Tasks CRUD
apiRouter.post('/tasks', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { title = '', subject = 'Physics', day = 'Mon', durationMin = 30 } = req.body as Omit<
    StudyTask,
    'id'
  >;
  if (!title.trim()) {
    res.status(400).json({ error: 'Task title is required.' });
    return;
  }
  const id = `task-${Date.now()}`;
  db.prepare(
    'INSERT INTO study_tasks (id, user_id, title, subject, day, duration_min, completed) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).run(id, userId, title.trim(), subject, day, durationMin);
  res.status(201).json({
    task: { id, title: title.trim(), subject, day, durationMin, completed: false },
  });
});

apiRouter.patch('/tasks/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { completed } = req.body as { completed: boolean };
  db.prepare('UPDATE study_tasks SET completed = ? WHERE id = ? AND user_id = ?').run(
    completed ? 1 : 0,
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

apiRouter.delete('/tasks/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('DELETE FROM study_tasks WHERE id = ? AND user_id = ?').run(
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

// Saved Doubts CRUD
apiRouter.post('/doubts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const doubt = req.body as SavedDoubt;
  if (!doubt || !doubt.question || !doubt.answer) {
    res.status(400).json({ error: 'Question and answer are required.' });
    return;
  }
  const id = doubt.id || `doubt-${Date.now()}`;
  db.prepare(
    'INSERT OR REPLACE INTO saved_doubts (id, user_id, subject, question, answer, mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user!.id, doubt.subject, doubt.question, doubt.answer, doubt.mode, doubt.createdAt);
  recordLearningEvent(db, req.user!.id, 'DOUBT_SOLVED', 'doubt', id, 15, { subject: doubt.subject });
  res.status(201).json({ ok: true, id });
});

apiRouter.delete('/doubts/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('DELETE FROM saved_doubts WHERE id = ? AND user_id = ?').run(
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

// Support Tickets
apiRouter.post('/support/tickets', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const ticket = req.body as SupportTicket;
  if (!ticket || !ticket.subject || !ticket.message) {
    res.status(400).json({ error: 'Subject and message are required.' });
    return;
  }
  const id = ticket.id || `TKT-${Date.now()}`;
  db.prepare(
    'INSERT INTO support_tickets (id, user_id, category, subject, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.user!.id,
    ticket.category || 'Academic Doubt',
    ticket.subject,
    ticket.message,
    'Open',
    ticket.createdAt || 'Just now'
  );
  res.status(201).json({ ok: true, id });
});

// ============================================================================
// 3. TEACHER / FACULTY PORTAL & CONTENT AUTHORING STUDIO API
// ============================================================================

apiRouter.post(
  '/teacher/classes',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const cls = req.body as LiveClassItem;
    if (!cls || !cls.title || !cls.subject) {
      res.status(400).json({ error: 'Class title and subject are required.' });
      return;
    }
    const id = cls.id || `live-${Date.now()}`;
    db.prepare(
      `INSERT INTO live_classes (
        id, title, subject, instructor, instructor_role, instructor_avatar, status,
        scheduled_time, date_label, time_range, grade_label, language, track, chapter,
        attendees_count, whiteboard_notes_json, poll_question_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      cls.title,
      cls.subject,
      cls.instructor || req.user!.name,
      cls.instructorRole || 'Faculty · Sri Chaitanya Educational Institutions',
      cls.instructorAvatar || '/src/assets/images/mentor_physics_1794761540100.jpg',
      cls.status || 'upcoming',
      cls.scheduledTime || `Starts Today · ${cls.timeRange}`,
      cls.dateLabel || 'Today',
      cls.timeRange || '7:00 pm – 7:55 pm',
      cls.gradeLabel || 'Grade 10',
      cls.language || 'ENGLISH',
      cls.track || 'CBSE Grade 10',
      cls.chapter || cls.title,
      cls.attendeesCount || 120,
      JSON.stringify(cls.whiteboardNotes || []),
      JSON.stringify(cls.pollQuestion || { prompt: 'Quick check?', options: [] })
    );
    res.status(201).json({ ok: true, id });
  }
);

apiRouter.post(
  '/teacher/assignments',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const { title = '', subject = 'Physics', gradeLabel = 'Grade 10', dueDate = 'Tomorrow · 9:00 PM' } =
      req.body as Partial<TeacherAssignment>;
    if (!title.trim()) {
      res.status(400).json({ error: 'Assignment title is required.' });
      return;
    }
    const rosterCount = (db.prepare('SELECT COUNT(*) AS cnt FROM attendance_roster').get() as { cnt: number }).cnt || 28;
    const id = `asg-${Date.now()}`;
    const assignment: TeacherAssignment = {
      id,
      title: title.trim(),
      subject: subject as SubjectName,
      gradeLabel,
      dueDate,
      submittedCount: 0,
      totalStudents: rosterCount,
      status: 'Active',
    };
    db.prepare(
      'INSERT INTO teacher_assignments (id, title, subject, grade_label, due_date, submitted_count, total_students, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      assignment.id,
      assignment.title,
      assignment.subject,
      assignment.gradeLabel,
      assignment.dueDate,
      assignment.submittedCount,
      assignment.totalStudents,
      assignment.status
    );
    res.status(201).json({ assignment });
  }
);

apiRouter.patch(
  '/teacher/assignments/:id',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.body as { status: 'Active' | 'Graded' };
    db.prepare('UPDATE teacher_assignments SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
  }
);

apiRouter.post(
  '/teacher/attendance',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const { roster } = req.body as { roster?: AttendanceStudent[] };
    if (!Array.isArray(roster)) {
      res.status(400).json({ error: 'Attendance roster array is required.' });
      return;
    }
    const stmt = db.prepare('UPDATE attendance_roster SET status = ? WHERE id = ?');
    db.exec('BEGIN');
    try {
      for (const stu of roster) {
        stmt.run(stu.status, stu.id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json({ ok: true });
  }
);

// Backend Space Diagnostics & Content Authoring Endpoints (For Filling Real Data Later)
apiRouter.get(
  '/teacher/content/stats',
  requireAuth,
  requireTeacher,
  (_req: AuthenticatedRequest, res: Response) => {
    const counts = {
      users: (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c,
      chapters: (db.prepare('SELECT COUNT(*) AS c FROM chapters').get() as { c: number }).c,
      lessons: (db.prepare('SELECT COUNT(*) AS c FROM lessons').get() as { c: number }).c,
      questions: (db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).c,
      dppSheets: (db.prepare('SELECT COUNT(*) AS c FROM dpp_sheets').get() as { c: number }).c,
      ncertSolutions: (db.prepare('SELECT COUNT(*) AS c FROM ncert_solutions').get() as { c: number }).c,
      mockTests: (db.prepare('SELECT COUNT(*) AS c FROM mock_tests').get() as { c: number }).c,
      flashcards: (db.prepare('SELECT COUNT(*) AS c FROM flashcards').get() as { c: number }).c,
      liveClasses: (db.prepare('SELECT COUNT(*) AS c FROM live_classes').get() as { c: number }).c,
    };
    res.json({ counts, databaseEngine: 'SQLite (node:sqlite WAL)' });
  }
);

apiRouter.post(
  '/teacher/content/chapters',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const {
      subject = 'Physics',
      title = '',
      unit = 'Unit 1',
      weightage = 'Core Syllabus',
      lessonTitle = '',
      lessonType = 'video',
      durationMin = 35,
      summary = '',
      keyFormulas = [],
      notesContent = '',
    } = req.body as {
      subject?: SubjectName;
      title?: string;
      unit?: string;
      weightage?: string;
      lessonTitle?: string;
      lessonType?: 'video' | 'notes' | 'practice';
      durationMin?: number;
      summary?: string;
      keyFormulas?: string[];
      notesContent?: string;
    };

    if (!title.trim() || !lessonTitle.trim()) {
      res.status(400).json({ error: 'Chapter title and initial lesson title are required.' });
      return;
    }

    const chapterId = `ch-${Date.now()}`;
    const lessonId = `les-${Date.now()}`;

    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO chapters (id, subject, title, unit, weightage, mastery_percent, sort_order) VALUES (?, ?, ?, ?, ?, 0, 99)'
      ).run(chapterId, subject, title.trim(), unit.trim(), weightage.trim());

      db.prepare(
        `INSERT INTO lessons (
          id, chapter_id, title, duration_min, type, instructor, summary,
          key_formulas_json, timestamps_json, notes_content, default_completed, default_bookmarked, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`
      ).run(
        lessonId,
        chapterId,
        lessonTitle.trim(),
        durationMin,
        lessonType,
        req.user!.name,
        summary.trim() || `Faculty concept lecture on ${lessonTitle.trim()}.`,
        JSON.stringify(keyFormulas.length > 0 ? keyFormulas : ['Key Concept Formula']),
        JSON.stringify([{ time: '00:00', label: lessonTitle.trim() }]),
        notesContent.trim() || `${lessonTitle.trim()}\nAdded via Infinity Learn Content Studio.`
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.status(201).json({ ok: true, chapterId, lessonId });
  }
);

apiRouter.post(
  '/teacher/content/questions',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const q = req.body as Partial<QuestionItem>;
    if (!q.prompt?.trim() || !Array.isArray(q.options) || q.options.length !== 4) {
      res.status(400).json({ error: 'Question prompt and exactly 4 options are required.' });
      return;
    }
    const id = q.id || `q-custom-${Date.now()}`;
    db.prepare(
      `INSERT INTO questions (
        id, subject, chapter_id, chapter_title, difficulty, prompt,
        options_json, correct_index, explanation, formula_used, avg_time_sec
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      q.subject || 'Physics',
      q.chapterId || 'phy-magnetic',
      q.chapterTitle || 'Faculty Added Chapter',
      q.difficulty || 'Moderate',
      q.prompt.trim(),
      JSON.stringify(q.options),
      typeof q.correctIndex === 'number' ? q.correctIndex : 0,
      q.explanation?.trim() || 'Faculty verified solution.',
      q.formulaUsed?.trim() || 'Core Principle',
      q.avgTimeSec || 45
    );
    res.status(201).json({ ok: true, id });
  }
);

apiRouter.post(
  '/teacher/content/ncert',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const item = req.body as Partial<NcertSolutionItem>;
    if (!item.question?.trim() || !item.chapter?.trim() || !item.finalAnswer?.trim()) {
      res.status(400).json({ error: 'Chapter, question, and final answer are required.' });
      return;
    }
    const id = item.id || `ncert-custom-${Date.now()}`;
    const steps =
      Array.isArray(item.solutionSteps) && item.solutionSteps.length > 0
        ? item.solutionSteps
        : [`1. Apply standard NCERT derivation for ${item.chapter}.`];
    db.prepare(
      'INSERT INTO ncert_solutions (id, subject, chapter, exercise_ref, question, solution_steps_json, final_answer) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      item.subject || 'Physics',
      item.chapter.trim(),
      item.exerciseRef?.trim() || 'NCERT Exercise',
      item.question.trim(),
      JSON.stringify(steps),
      item.finalAnswer.trim()
    );
    res.status(201).json({ ok: true, id });
  }
);

apiRouter.post(
  '/teacher/content/flashcards',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const fc = req.body as Partial<FlashcardItem>;
    if (!fc.front?.trim() || !fc.back?.trim()) {
      res.status(400).json({ error: 'Flashcard front prompt and back answer are required.' });
      return;
    }
    const id = fc.id || `fc-custom-${Date.now()}`;
    db.prepare(
      'INSERT INTO flashcards (id, subject, chapter, front, hint, back, formula, default_status, default_bookmarked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
    ).run(
      id,
      fc.subject || 'Physics',
      fc.chapter?.trim() || 'Core Revision',
      fc.front.trim(),
      fc.hint?.trim() || 'Recall fundamental theorem.',
      fc.back.trim(),
      fc.formula?.trim() || 'Concept Recall',
      'new'
    );
    res.status(201).json({ ok: true, id });
  }
);

apiRouter.get(
  '/teacher/content/export',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const data = buildBootstrapPayload(req.user!.id);
    res.json({
      schemaVersion: '2.0',
      exportedAt: new Date().toISOString(),
      chapters: data.chapters,
      questions: data.questions,
      mockTests: data.mockTests,
      dppSheets: data.dppSheets,
      ncertSolutions: data.ncertSolutions,
      flashcards: data.flashcards,
    });
  }
);

apiRouter.post(
  '/teacher/content/import',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const payload = req.body as {
      chapters?: ChapterItem[];
      questions?: QuestionItem[];
      mockTests?: MockTestTemplate[];
      dppSheets?: DppSheetItem[];
      ncertSolutions?: NcertSolutionItem[];
      flashcards?: FlashcardItem[];
    };

    let inserted = 0;
    db.exec('BEGIN');
    try {
      if (Array.isArray(payload.chapters)) {
        const upCh = db.prepare(
          'INSERT OR REPLACE INTO chapters (id, subject, title, unit, weightage, mastery_percent, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        const upLes = db.prepare(
          `INSERT OR REPLACE INTO lessons (
            id, chapter_id, title, duration_min, type, instructor, summary,
            key_formulas_json, timestamps_json, notes_content, default_completed, default_bookmarked, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        payload.chapters.forEach((ch, idx) => {
          upCh.run(ch.id, ch.subject, ch.title, ch.unit, ch.weightage, ch.masteryPercent || 0, idx);
          inserted++;
          (ch.lessons || []).forEach((les, lIdx) => {
            upLes.run(
              les.id,
              ch.id,
              les.title,
              les.durationMin,
              les.type,
              les.instructor,
              les.summary,
              JSON.stringify(les.keyFormulas || []),
              JSON.stringify(les.timestamps || []),
              les.notesContent || '',
              les.completed ? 1 : 0,
              les.bookmarked ? 1 : 0,
              lIdx
            );
            inserted++;
          });
        });
      }

      if (Array.isArray(payload.questions)) {
        const upQ = db.prepare(
          `INSERT OR REPLACE INTO questions (
            id, subject, chapter_id, chapter_title, difficulty, prompt,
            options_json, correct_index, explanation, formula_used, avg_time_sec
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const q of payload.questions) {
          upQ.run(
            q.id,
            q.subject,
            q.chapterId,
            q.chapterTitle,
            q.difficulty,
            q.prompt,
            JSON.stringify(q.options),
            q.correctIndex,
            q.explanation,
            q.formulaUsed,
            q.avgTimeSec || 45
          );
          inserted++;
        }
      }

      if (Array.isArray(payload.ncertSolutions)) {
        const upN = db.prepare(
          'INSERT OR REPLACE INTO ncert_solutions (id, subject, chapter, exercise_ref, question, solution_steps_json, final_answer) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        for (const n of payload.ncertSolutions) {
          upN.run(
            n.id,
            n.subject,
            n.chapter,
            n.exerciseRef,
            n.question,
            JSON.stringify(n.solutionSteps),
            n.finalAnswer
          );
          inserted++;
        }
      }

      if (Array.isArray(payload.flashcards)) {
        const upF = db.prepare(
          'INSERT OR REPLACE INTO flashcards (id, subject, chapter, front, hint, back, formula, default_status, default_bookmarked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (const f of payload.flashcards) {
          upF.run(
            f.id,
            f.subject,
            f.chapter,
            f.front,
            f.hint,
            f.back,
            f.formula,
            f.status || 'new',
            f.bookmarked ? 1 : 0
          );
          inserted++;
        }
      }

      if (Array.isArray(payload.dppSheets)) {
        const upD = db.prepare(
          'INSERT OR REPLACE INTO dpp_sheets (id, title, subject, date_label, estimated_min, question_ids_json) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const d of payload.dppSheets) {
          upD.run(
            d.id,
            d.title,
            d.subject,
            d.dateLabel,
            d.estimatedMin,
            JSON.stringify(d.questionIds || [])
          );
          inserted++;
        }
      }

      if (Array.isArray(payload.mockTests)) {
        const upM = db.prepare(
          'INSERT OR REPLACE INTO mock_tests (id, title, category, subjects_json, duration_min, total_marks, negative_marking, difficulty, question_ids_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (const m of payload.mockTests) {
          upM.run(
            m.id,
            m.title,
            m.category,
            JSON.stringify(m.subjects || []),
            m.durationMin,
            m.totalMarks,
            m.negativeMarking ? 1 : 0,
            m.difficulty,
            JSON.stringify(m.questionIds || [])
          );
          inserted++;
        }
      }

      db.exec('COMMIT');
      res.json({ ok: true, recordsUpserted: inserted });
    } catch (err) {
      db.exec('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Bulk JSON import failed.';
      res.status(400).json({ error: msg });
    }
  }
);

// ============================================================================
// 4. INSTITUTIONAL ADMIN PORTAL API (admin.infinitylearn.com / Genius Admin)
// ============================================================================

apiRouter.get(
  '/admin/overview',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const base = buildBootstrapPayload(req.user!.id);

    const userRows = db
      .prepare(
        `SELECT u.id, u.role, u.name, u.initials, u.email, u.phone, u.admission_id, u.track, u.program_name,
                u.grade, u.streak_days, u.weekly_hours_logged, u.created_at,
                u.batch_id, u.campus, u.subjects_json,
                b.code AS batch_code, b.name AS batch_name
         FROM users u
         LEFT JOIN batches b ON b.id = u.batch_id
         ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'teacher' THEN 1 ELSE 2 END, u.created_at DESC`
      )
      .all() as Array<{
      id: string;
      role: PortalRole;
      name: string;
      initials: string;
      email: string | null;
      phone: string | null;
      admission_id: string | null;
      track: ExamTrack;
      program_name: string;
      grade: string;
      streak_days: number;
      weekly_hours_logged: number;
      created_at: string;
      batch_id: string | null;
      campus: string | null;
      subjects_json: string | null;
      batch_code: string | null;
      batch_name: string | null;
    }>;

    const users = userRows.map((u) => ({
      id: u.id,
      role: normalizeRole(u.role),
      name: u.name,
      initials: u.initials,
      email: u.email || '',
      phone: u.phone || '',
      admissionId: u.admission_id || '',
      track: u.track,
      programName: u.program_name,
      grade: u.grade,
      streakDays: u.streak_days,
      weeklyHoursLogged: u.weekly_hours_logged,
      createdAt: u.created_at,
      batchId: u.batch_id || undefined,
      batchCode: u.batch_code || undefined,
      batchName: u.batch_name || undefined,
      campus: u.campus || undefined,
      subjects: parseSubjects(u.subjects_json),
    }));

    const batchRows = db
      .prepare('SELECT * FROM batches ORDER BY created_at DESC, rowid ASC')
      .all() as Array<{
      id: string;
      code: string;
      name: string;
      track: ExamTrack;
      campus: string;
      lead_faculty: string;
      student_count: number;
      capacity: number;
      schedule_slot: string;
      status: 'Active' | 'Upcoming' | 'Archived';
      created_at: string;
    }>;

    const batches = batchRows.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      track: b.track,
      campus: b.campus,
      leadFaculty: b.lead_faculty,
      studentCount: b.student_count,
      capacity: b.capacity,
      scheduleSlot: b.schedule_slot,
      status: b.status,
      createdAt: b.created_at,
    }));

    const ticketRows = db
      .prepare(
        `SELECT st.*, u.name AS user_name, u.email AS user_email, u.admission_id AS admission_id
         FROM support_tickets st
         LEFT JOIN users u ON u.id = st.user_id
         ORDER BY st.rowid DESC`
      )
      .all() as Array<{
      id: string;
      user_id: string;
      category: string;
      subject: string;
      message: string;
      status: 'Open' | 'Resolved';
      created_at: string;
      user_name: string | null;
      user_email: string | null;
      admission_id: string | null;
    }>;

    const tickets = ticketRows.map((t) => ({
      id: t.id,
      userId: t.user_id,
      userName: t.user_name || 'Student',
      userEmail: t.user_email || '',
      admissionId: t.admission_id || '',
      category: t.category,
      subject: t.subject,
      message: t.message,
      status: t.status,
      createdAt: t.created_at,
    }));

    const attemptRows = db
      .prepare(
        `SELECT ta.id, ta.user_id, ta.test_title, ta.category, ta.date_label,
                ta.score, ta.max_score, ta.accuracy_percent,
                u.name AS student_name, u.admission_id AS admission_id
         FROM test_attempts ta
         LEFT JOIN users u ON u.id = ta.user_id
         ORDER BY ta.created_at DESC, ta.rowid DESC
         LIMIT 25`
      )
      .all() as Array<{
      id: string;
      user_id: string;
      student_name: string | null;
      admission_id: string | null;
      test_title: string;
      category: string;
      date_label: string;
      score: number;
      max_score: number;
      accuracy_percent: number;
    }>;

    const recentAttempts = attemptRows.map((a) => ({
      id: a.id,
      userId: a.user_id,
      studentName: a.student_name || 'Student',
      admissionId: a.admission_id || '',
      testTitle: a.test_title,
      category: a.category,
      dateLabel: a.date_label,
      score: a.score,
      maxScore: a.max_score,
      accuracyPercent: a.accuracy_percent,
    }));

    const auditRows = db
      .prepare('SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 40')
      .all() as Array<{
      id: number;
      actor_name: string;
      actor_role: string;
      action: string;
      target_type: string;
      target_id: string;
      details: string;
      created_at: string;
    }>;

    const auditLogs = auditRows.map((l) => ({
      id: l.id,
      actorName: l.actor_name,
      actorRole: l.actor_role,
      action: l.action,
      targetType: l.target_type,
      targetId: l.target_id,
      details: l.details,
      createdAt: l.created_at,
    }));

    const lessonCount = (db.prepare('SELECT COUNT(*) AS c FROM lessons').get() as { c: number }).c;
    const totalAttemptsRow = db
      .prepare('SELECT COUNT(*) AS c, COALESCE(AVG(accuracy_percent), 0) AS avgAcc FROM test_attempts')
      .get() as { c: number; avgAcc: number };

    res.json({
      metrics: {
        totalUsers: users.length,
        studentCount: users.filter((u) => u.role === 'student').length,
        teacherCount: users.filter((u) => u.role === 'teacher').length,
        adminCount: users.filter((u) => u.role === 'admin').length,
        activeBatches: batches.filter((b) => b.status === 'Active').length,
        totalBatches: batches.length,
        totalChapters: base.chapters.length,
        totalLessons: lessonCount,
        totalQuestions: base.questions.length,
        totalMockTests: base.mockTests.length,
        totalLiveClasses: base.liveClasses.length,
        totalDppSheets: base.dppSheets.length,
        totalNcertSolutions: base.ncertSolutions.length,
        totalFlashcards: base.flashcards.length,
        openTicketsCount: tickets.filter((t) => t.status === 'Open').length,
        totalTestAttempts: totalAttemptsRow.c,
        avgAccuracyPercent: Math.round(totalAttemptsRow.avgAcc || 0),
      },
      users,
      batches,
      tickets,
      recentAttempts,
      auditLogs,
      chapters: base.chapters,
      liveClasses: base.liveClasses,
      questions: base.questions,
      mockTests: base.mockTests,
      dppSheets: base.dppSheets,
      ncertSolutions: base.ncertSolutions,
      flashcards: base.flashcards,
    });
  }
);

apiRouter.post(
  '/admin/users',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const {
      name = '',
      email = '',
      phone = '',
      role = 'student',
      track = 'IIT-JEE',
      programName = '',
      grade = 'Class 12',
      password = 'Infinity@2027',
      dobPin = '2009-05-14',
      admissionId = '',
      batchId = '',
      campus = 'Online National Live Cohort',
      subjects = [],
    } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      role?: PortalRole;
      track?: ExamTrack;
      programName?: string;
      grade?: string;
      password?: string;
      dobPin?: string;
      admissionId?: string;
      batchId?: string;
      campus?: string;
      subjects?: SubjectName[];
    };

    if (!name.trim() || (!email.trim() && !phone.trim())) {
      res.status(400).json({ error: 'Name and at least an email or mobile number are required.' });
      return;
    }

    const targetRole = normalizeRole(role);
    const cleanEmail = email.trim().toLowerCase() || null;
    const formattedPhone = phone.trim() ? normalizePhone(phone) : null;

    const conflict = db
      .prepare(
        'SELECT id FROM users WHERE (email IS NOT NULL AND LOWER(email) = ?) OR (phone IS NOT NULL AND phone = ?)'
      )
      .get(cleanEmail || '', formattedPhone || '') as { id: string } | undefined;

    if (conflict) {
      res.status(409).json({ error: 'A user with this email or mobile number already exists.' });
      return;
    }

    const prefix =
      targetRole === 'admin'
        ? 'IL-ADM'
        : targetRole === 'teacher'
        ? 'IL-FAC'
        : targetRole === 'parent'
        ? 'IL-PAR'
        : 'IL-STU';
    const id = `${prefix}-${Date.now()}`;
    const resolvedAdmissionId =
      admissionId.trim().toUpperCase() ||
      `${
        targetRole === 'admin'
          ? 'SC-ADM'
          : targetRole === 'teacher'
          ? 'SC-FAC'
          : targetRole === 'parent'
          ? 'SC-PAR'
          : 'SC-HYD'
      }-${Math.floor(1000 + Math.random() * 9000)}`;
    const resolvedProgram =
      programName.trim() ||
      (targetRole === 'admin'
        ? 'Ramu School Institutional Control Center'
        : targetRole === 'teacher'
        ? 'Sri Chaitanya Faculty Live Class Console'
        : targetRole === 'parent'
        ? 'Ramu School Parent Progress Portal'
        : track === 'IIT-JEE'
        ? 'IIT-JEE 2027 Comprehensive Program'
        : track === 'NEET UG'
        ? 'NEET UG 2027 Target Medical Program'
        : track === 'CBSE Class 12'
        ? 'CBSE Class 12 Board Excellence Program'
        : 'CBSE Grade 10 Science Full Program');

    db.prepare(
      `INSERT INTO users (
        id, role, name, initials, email, phone, admission_id, password_hash, dob_pin,
        track, program_name, grade, daily_goal_hours, streak_days, weekly_hours_logged,
        avatar_url, login_method, batch_id, campus, subjects_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      targetRole,
      name.trim(),
      computeInitials(name),
      cleanEmail,
      formattedPhone,
      resolvedAdmissionId,
      hashPassword(password || 'Infinity@2027'),
      dobPin.trim() || '2009-05-14',
      track,
      resolvedProgram,
      targetRole === 'admin'
        ? 'Campus Admin'
        : targetRole === 'teacher'
        ? 'Faculty Mentor'
        : targetRole === 'parent'
        ? 'Parent / Guardian'
        : grade,
      4,
      1,
      0,
      targetRole === 'student'
        ? '/src/assets/images/avatar_student_1794761540782.jpg'
        : '/src/assets/images/mentor_physics_1794761540100.jpg',
      'password',
      batchId.trim() || null,
      campus.trim() || 'Online National Live Cohort',
      JSON.stringify(Array.isArray(subjects) ? subjects : [])
    );

    logAdminAction(
      req.user!,
      'PROVISION_USER',
      'user',
      id,
      `Provisioned ${targetRole} account "${name.trim()}" (${resolvedAdmissionId}).`
    );

    res.status(201).json({ ok: true, id, admissionId: resolvedAdmissionId });
  }
);

apiRouter.patch(
  '/admin/users/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const targetId = req.params.id;
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as unknown as
      | DbUserRow
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const body = req.body as {
      role?: PortalRole;
      track?: ExamTrack;
      programName?: string;
      grade?: string;
      name?: string;
      batchId?: string | null;
      campus?: string;
      subjects?: SubjectName[];
      dailyGoalHours?: number;
    };

    const nextRole = body.role ? normalizeRole(body.role) : normalizeRole(existing.role);
    const nextTrack = body.track || existing.track;
    const nextProgram = body.programName ?? existing.program_name;
    const nextGrade = body.grade ?? existing.grade;
    const nextName = (body.name ?? existing.name).trim() || existing.name;
    const nextBatchId =
      body.batchId !== undefined ? (body.batchId ? body.batchId : null) : existing.batch_id || null;
    const nextCampus = body.campus !== undefined ? body.campus : existing.campus || 'Online National Live Cohort';
    const nextSubjectsJson =
      body.subjects !== undefined
        ? JSON.stringify(body.subjects)
        : existing.subjects_json || '[]';
    const nextDailyGoal =
      typeof body.dailyGoalHours === 'number' ? body.dailyGoalHours : existing.daily_goal_hours;

    db.prepare(
      `UPDATE users
       SET role = ?, track = ?, program_name = ?, grade = ?, name = ?, initials = ?,
           batch_id = ?, campus = ?, subjects_json = ?, daily_goal_hours = ?
       WHERE id = ?`
    ).run(
      nextRole,
      nextTrack,
      nextProgram,
      nextGrade,
      nextName,
      computeInitials(nextName),
      nextBatchId,
      nextCampus,
      nextSubjectsJson,
      nextDailyGoal,
      targetId
    );

    logAdminAction(
      req.user!,
      'UPDATE_USER',
      'user',
      targetId,
      `Updated "${nextName}" · role=${nextRole}, track=${nextTrack}, batch=${nextBatchId || 'unassigned'}.`
    );

    res.json({ ok: true });
  }
);

apiRouter.post(
  '/admin/users/:id/reset-password',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const targetId = req.params.id;
    const { newPassword = '', dobPin } = req.body as { newPassword?: string; dobPin?: string };
    const existing = db.prepare('SELECT id, name, dob_pin FROM users WHERE id = ?').get(targetId) as
      | { id: string; name: string; dob_pin: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (newPassword.trim()) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        hashPassword(newPassword.trim()),
        targetId
      );
    }
    if (dobPin?.trim()) {
      db.prepare('UPDATE users SET dob_pin = ? WHERE id = ?').run(dobPin.trim(), targetId);
    }
    logAdminAction(
      req.user!,
      'RESET_CREDENTIALS',
      'user',
      targetId,
      `Reset login credentials for "${existing.name}".`
    );
    res.json({ ok: true });
  }
);

apiRouter.delete(
  '/admin/users/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const targetId = req.params.id;
    if (targetId === req.user!.id) {
      res.status(400).json({ error: 'You cannot delete your own active administrator session.' });
      return;
    }
    const existing = db.prepare('SELECT name FROM users WHERE id = ?').get(targetId) as
      | { name: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    logAdminAction(req.user!, 'DELETE_USER', 'user', targetId, `Removed user "${existing.name}".`);
    res.json({ ok: true });
  }
);

apiRouter.post(
  '/admin/batches',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const {
      code = '',
      name = '',
      track = 'IIT-JEE',
      campus = 'Online National Live Cohort',
      leadFaculty = 'Prof. Priya Menon',
      capacity = 60,
      studentCount = 0,
      scheduleSlot = 'Mon–Sat · 5:00 PM – 7:30 PM',
      status = 'Active',
    } = req.body as {
      code?: string;
      name?: string;
      track?: ExamTrack;
      campus?: string;
      leadFaculty?: string;
      capacity?: number;
      studentCount?: number;
      scheduleSlot?: string;
      status?: 'Active' | 'Upcoming' | 'Archived';
    };

    if (!code.trim() || !name.trim()) {
      res.status(400).json({ error: 'Batch code and cohort name are required.' });
      return;
    }

    const id = `batch-${Date.now()}`;
    const cleanCode = code.trim().toUpperCase();
    try {
      db.prepare(
        `INSERT INTO batches (id, code, name, track, campus, lead_faculty, student_count, capacity, schedule_slot, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        cleanCode,
        name.trim(),
        track,
        campus.trim(),
        leadFaculty.trim(),
        Number(studentCount) || 0,
        Math.max(10, Number(capacity) || 60),
        scheduleSlot.trim(),
        status
      );
    } catch {
      res.status(409).json({ error: `Batch code ${cleanCode} already exists.` });
      return;
    }

    logAdminAction(
      req.user!,
      'CREATE_BATCH',
      'batch',
      id,
      `Created cohort ${cleanCode} ("${name.trim()}") under ${track}.`
    );

    res.status(201).json({ ok: true, id });
  }
);

apiRouter.patch(
  '/admin/batches/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;
    const { status, studentCount, leadFaculty, scheduleSlot } = req.body as {
      status?: 'Active' | 'Upcoming' | 'Archived';
      studentCount?: number;
      leadFaculty?: string;
      scheduleSlot?: string;
    };

    const existing = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as
      | {
          code: string;
          status: string;
          student_count: number;
          lead_faculty: string;
          schedule_slot: string;
        }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Batch not found.' });
      return;
    }

    db.prepare(
      'UPDATE batches SET status = ?, student_count = ?, lead_faculty = ?, schedule_slot = ? WHERE id = ?'
    ).run(
      status || existing.status,
      typeof studentCount === 'number' ? studentCount : existing.student_count,
      leadFaculty || existing.lead_faculty,
      scheduleSlot || existing.schedule_slot,
      id
    );

    logAdminAction(
      req.user!,
      'UPDATE_BATCH',
      'batch',
      id,
      `Updated cohort ${existing.code} (status=${status || existing.status}).`
    );

    res.json({ ok: true });
  }
);

apiRouter.delete(
  '/admin/batches/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;
    db.prepare('DELETE FROM batches WHERE id = ?').run(id);
    logAdminAction(req.user!, 'DELETE_BATCH', 'batch', id, `Deleted batch ${id}.`);
    res.json({ ok: true });
  }
);

apiRouter.post(
  '/admin/mock-tests',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const {
      title = '',
      category = 'All India Test Series',
      subjects = ['Physics', 'Chemistry', 'Mathematics'],
      durationMin = 30,
      negativeMarking = true,
      difficulty = 'Moderate',
      questionIds = [],
    } = req.body as Partial<MockTestTemplate>;

    if (!title.trim() || !Array.isArray(questionIds) || questionIds.length === 0) {
      res.status(400).json({ error: 'Mock test title and at least one question are required.' });
      return;
    }

    const id = `mock-${Date.now()}`;
    const totalMarks = questionIds.length * 4;
    db.prepare(
      `INSERT INTO mock_tests (id, title, category, subjects_json, duration_min, total_marks, negative_marking, difficulty, question_ids_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      title.trim(),
      category,
      JSON.stringify(subjects),
      Number(durationMin) || 30,
      totalMarks,
      negativeMarking ? 1 : 0,
      difficulty,
      JSON.stringify(questionIds)
    );

    logAdminAction(
      req.user!,
      'PUBLISH_MOCK_TEST',
      'mock_test',
      id,
      `Published "${title.trim()}" (${questionIds.length} Qs · ${totalMarks} Marks).`
    );

    res.status(201).json({ ok: true, id });
  }
);

apiRouter.delete(
  '/admin/mock-tests/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;
    db.prepare('DELETE FROM mock_tests WHERE id = ?').run(id);
    logAdminAction(req.user!, 'DELETE_MOCK_TEST', 'mock_test', id, `Removed mock test ${id}.`);
    res.json({ ok: true });
  }
);

apiRouter.post(
  '/admin/dpp-sheets',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const {
      title = '',
      subject = 'Physics',
      dateLabel = 'Today',
      estimatedMin = 20,
      questionIds = [],
    } = req.body as Partial<DppSheetItem>;

    if (!title.trim() || !Array.isArray(questionIds) || questionIds.length === 0) {
      res.status(400).json({ error: 'DPP title and at least one selected question are required.' });
      return;
    }

    const id = `dpp-${Date.now()}`;
    db.prepare(
      'INSERT INTO dpp_sheets (id, title, subject, date_label, estimated_min, question_ids_json) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, title.trim(), subject, dateLabel, Number(estimatedMin) || 20, JSON.stringify(questionIds));

    logAdminAction(
      req.user!,
      'PUBLISH_DPP',
      'dpp_sheet',
      id,
      `Published DPP "${title.trim()}" (${questionIds.length} Qs).`
    );

    res.status(201).json({ ok: true, id });
  }
);

const ALLOWED_DELETE_TABLES: Record<string, string> = {
  chapters: 'chapters',
  questions: 'questions',
  dpp_sheets: 'dpp_sheets',
  ncert_solutions: 'ncert_solutions',
  flashcards: 'flashcards',
  live_classes: 'live_classes',
};

apiRouter.delete(
  '/admin/content/:entity/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const table = ALLOWED_DELETE_TABLES[req.params.entity];
    if (!table) {
      res.status(400).json({ error: 'Unsupported content entity.' });
      return;
    }
    const id = req.params.id;
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    logAdminAction(
      req.user!,
      'DELETE_CONTENT',
      req.params.entity,
      id,
      `Deleted ${req.params.entity} record ${id}.`
    );
    res.json({ ok: true });
  }
);

apiRouter.patch(
  '/admin/tickets/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { status = 'Resolved' } = req.body as { status?: 'Open' | 'Resolved' };
    const id = req.params.id;
    db.prepare('UPDATE support_tickets SET status = ? WHERE id = ?').run(status, id);
    logAdminAction(
      req.user!,
      'UPDATE_TICKET',
      'support_ticket',
      id,
      `Marked support ticket ${id} as ${status}.`
    );
    res.json({ ok: true });
  }
);

apiRouter.get(
  '/admin/audit-logs',
  requireAuth,
  requireAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    const rows = db.prepare('SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 100').all();
    res.json({ logs: rows });
  }
);

// ============================================================================
// 5. ADMIN 360° CONTROL CENTER: EVERY STUDENT, EVERY TEACHER, EVERY TEST
// ============================================================================

apiRouter.get(
  '/admin/students',
  requireAuth,
  requireAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    const totalLessons = (db.prepare('SELECT COUNT(*) AS c FROM lessons').get() as { c: number }).c;
    const rows = db
      .prepare(
        `SELECT u.id, u.role, u.name, u.initials, u.email, u.phone, u.admission_id, u.track,
                u.program_name, u.grade, u.streak_days, u.weekly_hours_logged, u.created_at,
                u.batch_id, u.campus, u.subjects_json,
                b.code AS batch_code, b.name AS batch_name
         FROM users u
         LEFT JOIN batches b ON b.id = u.batch_id
         WHERE u.role = 'student'
         ORDER BY u.created_at DESC, u.name ASC`
      )
      .all() as Array<{
      id: string;
      role: PortalRole;
      name: string;
      initials: string;
      email: string | null;
      phone: string | null;
      admission_id: string | null;
      track: ExamTrack;
      program_name: string;
      grade: string;
      streak_days: number;
      weekly_hours_logged: number;
      created_at: string;
      batch_id: string | null;
      campus: string | null;
      subjects_json: string | null;
      batch_code: string | null;
      batch_name: string | null;
    }>;

    const students = rows.map((u) => {
      const attAgg = db
        .prepare(
          `SELECT COUNT(*) AS cnt,
                  COALESCE(AVG(accuracy_percent), 0) AS avgAcc,
                  COALESCE(MAX(CASE WHEN max_score > 0 THEN ROUND(score * 100.0 / max_score) ELSE 0 END), 0) AS bestPct
           FROM test_attempts WHERE user_id = ?`
        )
        .get(u.id) as { cnt: number; avgAcc: number; bestPct: number };

      const completedLessons = (
        db
          .prepare('SELECT COUNT(*) AS cnt FROM user_lesson_progress WHERE user_id = ? AND completed = 1')
          .get(u.id) as { cnt: number }
      ).cnt;

      const errCount = (
        db.prepare('SELECT COUNT(*) AS cnt FROM user_error_log WHERE user_id = ?').get(u.id) as {
          cnt: number;
        }
      ).cnt;

      const dppDone = (
        db
          .prepare('SELECT COUNT(*) AS cnt FROM user_dpp_progress WHERE user_id = ? AND completed = 1')
          .get(u.id) as { cnt: number }
      ).cnt;

      const openTickets = (
        db
          .prepare("SELECT COUNT(*) AS cnt FROM support_tickets WHERE user_id = ? AND status = 'Open'")
          .get(u.id) as { cnt: number }
      ).cnt;

      const doubtsCount = (
        db.prepare('SELECT COUNT(*) AS cnt FROM saved_doubts WHERE user_id = ?').get(u.id) as {
          cnt: number;
        }
      ).cnt;

      return {
        id: u.id,
        role: normalizeRole(u.role),
        name: u.name,
        initials: u.initials,
        email: u.email || '',
        phone: u.phone || '',
        admissionId: u.admission_id || '',
        track: u.track,
        programName: u.program_name,
        grade: u.grade,
        streakDays: u.streak_days,
        weeklyHoursLogged: u.weekly_hours_logged,
        createdAt: u.created_at,
        batchId: u.batch_id || undefined,
        batchCode: u.batch_code || undefined,
        batchName: u.batch_name || undefined,
        campus: u.campus || undefined,
        subjects: parseSubjects(u.subjects_json),
        testsTaken: attAgg.cnt,
        avgAccuracyPercent: Math.round(attAgg.avgAcc || 0),
        bestScorePercent: Math.round(attAgg.bestPct || 0),
        lessonsCompleted: completedLessons,
        totalLessons,
        errorLogCount: errCount,
        dppCompletedCount: dppDone,
        openTicketsCount: openTickets,
        savedDoubtsCount: doubtsCount,
      };
    });

    res.json({ students });
  }
);

apiRouter.get(
  '/admin/students/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const studentId = req.params.id;
    const row = db
      .prepare(
        `SELECT u.*, b.code AS batch_code, b.name AS batch_name
         FROM users u
         LEFT JOIN batches b ON b.id = u.batch_id
         WHERE u.id = ?`
      )
      .get(studentId) as unknown as
      | (DbUserRow & { created_at: string; batch_code: string | null; batch_name: string | null })
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }

    const base = buildBootstrapPayload(studentId);
    const batchRow = row.batch_id
      ? (db.prepare('SELECT * FROM batches WHERE id = ?').get(row.batch_id) as
          | {
              id: string;
              code: string;
              name: string;
              track: ExamTrack;
              campus: string;
              lead_faculty: string;
              student_count: number;
              capacity: number;
              schedule_slot: string;
              status: 'Active' | 'Upcoming' | 'Archived';
              created_at: string;
            }
          | undefined)
      : undefined;

    const batch = batchRow
      ? {
          id: batchRow.id,
          code: batchRow.code,
          name: batchRow.name,
          track: batchRow.track,
          campus: batchRow.campus,
          leadFaculty: batchRow.lead_faculty,
          studentCount: batchRow.student_count,
          capacity: batchRow.capacity,
          scheduleSlot: batchRow.schedule_slot,
          status: batchRow.status,
          createdAt: batchRow.created_at,
        }
      : null;

    const errorSet = new Set(base.errorLogIds);
    const errorLogQuestions = base.questions.filter((q) => errorSet.has(q.id));

    res.json({
      student: {
        id: row.id,
        role: normalizeRole(row.role),
        name: row.name,
        initials: row.initials,
        email: row.email || '',
        phone: row.phone || '',
        admissionId: row.admission_id || '',
        track: row.track,
        programName: row.program_name,
        grade: row.grade,
        streakDays: row.streak_days,
        weeklyHoursLogged: row.weekly_hours_logged,
        createdAt: row.created_at,
        batchId: row.batch_id || undefined,
        batchCode: row.batch_code || undefined,
        batchName: row.batch_name || undefined,
        campus: row.campus || undefined,
        subjects: parseSubjects(row.subjects_json),
      },
      batch,
      testAttempts: base.testHistory,
      chapters: base.chapters,
      errorLogQuestions,
      dppSheets: base.dppSheets,
      tasks: base.tasks,
      savedDoubts: base.savedDoubts,
      tickets: base.tickets,
      flashcards: base.flashcards,
    });
  }
);

apiRouter.post(
  '/admin/students/:id/assign-task',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const studentId = req.params.id;
    const { title = '', subject = 'Physics', day = 'Today', durationMin = 45 } = req.body as {
      title?: string;
      subject?: SubjectName;
      day?: StudyTask['day'] | 'Today';
      durationMin?: number;
    };
    if (!title.trim()) {
      res.status(400).json({ error: 'Task or test assignment title is required.' });
      return;
    }
    const id = `task-adm-${Date.now()}`;
    const validDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(day) ? day : 'Mon';
    db.prepare(
      'INSERT INTO study_tasks (id, user_id, title, subject, day, duration_min, completed) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).run(id, studentId, title.trim(), subject, validDay, Number(durationMin) || 45);

    logAdminAction(
      req.user!,
      'ASSIGN_STUDENT_TASK',
      'student',
      studentId,
      `Assigned "${title.trim()}" (${subject}, ${durationMin}m) to student ${studentId}.`
    );

    res.status(201).json({ ok: true, id });
  }
);

apiRouter.post(
  '/admin/students/:id/lessons/:lessonId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { id: studentId, lessonId } = req.params;
    const { completed, bookmarked } = req.body as { completed?: boolean; bookmarked?: boolean };
    const existing = db
      .prepare('SELECT completed, bookmarked FROM user_lesson_progress WHERE user_id = ? AND lesson_id = ?')
      .get(studentId, lessonId) as { completed: number; bookmarked: number } | undefined;

    const nextCompleted =
      typeof completed === 'boolean' ? (completed ? 1 : 0) : existing ? existing.completed : 0;
    const nextBookmarked =
      typeof bookmarked === 'boolean' ? (bookmarked ? 1 : 0) : existing ? existing.bookmarked : 0;

    db.prepare(
      `INSERT INTO user_lesson_progress (user_id, lesson_id, completed, bookmarked, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET
         completed = excluded.completed,
         bookmarked = excluded.bookmarked,
         updated_at = datetime('now')`
    ).run(studentId, lessonId, nextCompleted, nextBookmarked);

    logAdminAction(
      req.user!,
      'OVERRIDE_LESSON_PROGRESS',
      'student',
      studentId,
      `Set lesson ${lessonId} completed=${nextCompleted === 1} for student ${studentId}.`
    );

    res.json({ ok: true });
  }
);

apiRouter.delete(
  '/admin/students/:id/error-log/:questionId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    db.prepare('DELETE FROM user_error_log WHERE user_id = ? AND question_id = ?').run(
      req.params.id,
      req.params.questionId
    );
    logAdminAction(
      req.user!,
      'CLEAR_ERROR_LOG',
      'student',
      req.params.id,
      `Cleared error-log question ${req.params.questionId} for student ${req.params.id}.`
    );
    res.json({ ok: true });
  }
);

apiRouter.get(
  '/admin/teachers',
  requireAuth,
  requireAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    const rows = db
      .prepare(
        `SELECT u.*, b.code AS batch_code, b.name AS batch_name
         FROM users u
         LEFT JOIN batches b ON b.id = u.batch_id
         WHERE u.role = 'teacher'
         ORDER BY u.created_at DESC, u.name ASC`
      )
      .all() as unknown as Array<
      DbUserRow & { created_at: string; batch_code: string | null; batch_name: string | null }
    >;

    const allClasses = db
      .prepare('SELECT id, instructor, status, attendees_count FROM live_classes')
      .all() as Array<{ id: string; instructor: string; status: string; attendees_count: number }>;

    const totalAssignments = (
      db.prepare('SELECT COUNT(*) AS cnt FROM teacher_assignments').get() as { cnt: number }
    ).cnt;

    const allBatches = db.prepare('SELECT id, lead_faculty FROM batches').all() as Array<{
      id: string;
      lead_faculty: string;
    }>;

    const teachers = rows.map((t) => {
      const nameLower = t.name.toLowerCase();
      const firstWord = nameLower.replace(/^(prof\.|dr\.)\s*/i, '').split(' ')[0];
      const matchedClasses = allClasses.filter((c) => {
        const inst = c.instructor.toLowerCase();
        return inst === nameLower || (firstWord && inst.includes(firstWord));
      });
      const ledBatches = allBatches.filter((b) => {
        const lf = b.lead_faculty.toLowerCase();
        return lf === nameLower || (firstWord && lf.includes(firstWord));
      });

      return {
        id: t.id,
        role: normalizeRole(t.role),
        name: t.name,
        initials: t.initials,
        email: t.email || '',
        phone: t.phone || '',
        admissionId: t.admission_id || '',
        track: t.track,
        programName: t.program_name,
        grade: t.grade,
        streakDays: t.streak_days,
        weeklyHoursLogged: t.weekly_hours_logged,
        createdAt: t.created_at,
        batchId: t.batch_id || undefined,
        batchCode: t.batch_code || undefined,
        batchName: t.batch_name || undefined,
        campus: t.campus || undefined,
        subjects: parseSubjects(t.subjects_json),
        liveClassesCount: matchedClasses.length,
        upcomingClassesCount: matchedClasses.filter(
          (c) => c.status === 'live' || c.status === 'upcoming'
        ).length,
        recordedClassesCount: matchedClasses.filter((c) => c.status === 'recorded').length,
        batchesLedCount: ledBatches.length,
        assignmentsCount: totalAssignments,
        totalAttendeesReached: matchedClasses.reduce((s, c) => s + (c.attendees_count || 0), 0),
      };
    });

    res.json({ teachers });
  }
);

apiRouter.get(
  '/admin/teachers/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const teacherId = req.params.id;
    const row = db
      .prepare(
        `SELECT u.*, b.code AS batch_code, b.name AS batch_name
         FROM users u
         LEFT JOIN batches b ON b.id = u.batch_id
         WHERE u.id = ?`
      )
      .get(teacherId) as unknown as
      | (DbUserRow & { created_at: string; batch_code: string | null; batch_name: string | null })
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Faculty member not found.' });
      return;
    }

    const base = buildBootstrapPayload(teacherId);
    const nameLower = row.name.toLowerCase();
    const firstWord = nameLower.replace(/^(prof\.|dr\.)\s*/i, '').split(' ')[0];

    const batchRows = db.prepare('SELECT * FROM batches ORDER BY created_at DESC').all() as Array<{
      id: string;
      code: string;
      name: string;
      track: ExamTrack;
      campus: string;
      lead_faculty: string;
      student_count: number;
      capacity: number;
      schedule_slot: string;
      status: 'Active' | 'Upcoming' | 'Archived';
      created_at: string;
    }>;

    const assignedBatches = batchRows
      .filter((b) => {
        const lf = b.lead_faculty.toLowerCase();
        return b.id === row.batch_id || lf === nameLower || (firstWord && lf.includes(firstWord));
      })
      .map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        track: b.track,
        campus: b.campus,
        leadFaculty: b.lead_faculty,
        studentCount: b.student_count,
        capacity: b.capacity,
        scheduleSlot: b.schedule_slot,
        status: b.status,
        createdAt: b.created_at,
      }));

    const liveClasses = base.liveClasses
      .filter((c) => {
        const inst = c.instructor.toLowerCase();
        return inst === nameLower || (firstWord && inst.includes(firstWord));
      })
      .map((c) => {
        const chatCount = (
          db
            .prepare('SELECT COUNT(*) AS cnt FROM live_class_chat WHERE live_class_id = ?')
            .get(c.id) as { cnt: number }
        ).cnt;
        const pollVotes = (
          db
            .prepare('SELECT COUNT(*) AS cnt FROM live_class_poll_votes WHERE live_class_id = ?')
            .get(c.id) as { cnt: number }
        ).cnt;
        return { ...c, chatCount, totalPollVotes: pollVotes };
      });

    const assignedBatchIds = new Set(assignedBatches.map((b) => b.id));
    const stuRows = db
      .prepare(
        `SELECT u.*, b.code AS batch_code, b.name AS batch_name
         FROM users u
         LEFT JOIN batches b ON b.id = u.batch_id
         WHERE u.role = 'student'`
      )
      .all() as unknown as Array<
      DbUserRow & { created_at: string; batch_code: string | null; batch_name: string | null }
    >;

    const batchStudents = stuRows
      .filter((s) => (s.batch_id && assignedBatchIds.has(s.batch_id)) || s.track === row.track)
      .map((u) => ({
        id: u.id,
        role: normalizeRole(u.role),
        name: u.name,
        initials: u.initials,
        email: u.email || '',
        phone: u.phone || '',
        admissionId: u.admission_id || '',
        track: u.track,
        programName: u.program_name,
        grade: u.grade,
        streakDays: u.streak_days,
        weeklyHoursLogged: u.weekly_hours_logged,
        createdAt: u.created_at,
        batchId: u.batch_id || undefined,
        batchCode: u.batch_code || undefined,
        batchName: u.batch_name || undefined,
        campus: u.campus || undefined,
        subjects: parseSubjects(u.subjects_json),
      }));

    res.json({
      teacher: {
        id: row.id,
        role: normalizeRole(row.role),
        name: row.name,
        initials: row.initials,
        email: row.email || '',
        phone: row.phone || '',
        admissionId: row.admission_id || '',
        track: row.track,
        programName: row.program_name,
        grade: row.grade,
        streakDays: row.streak_days,
        weeklyHoursLogged: row.weekly_hours_logged,
        createdAt: row.created_at,
        batchId: row.batch_id || undefined,
        batchCode: row.batch_code || undefined,
        batchName: row.batch_name || undefined,
        campus: row.campus || undefined,
        subjects: parseSubjects(row.subjects_json),
      },
      assignedBatches,
      liveClasses,
      assignments: base.teacherAssignments,
      attendanceRoster: base.attendanceRoster,
      batchStudents,
    });
  }
);

apiRouter.post(
  '/admin/teachers/:id/classes',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const teacherRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as unknown as
      | DbUserRow
      | undefined;
    if (!teacherRow) {
      res.status(404).json({ error: 'Faculty member not found.' });
      return;
    }

    const {
      title = '',
      subject = 'Physics',
      gradeLabel = 'Grade 12',
      dateLabel = 'Today',
      timeRange = '7:00 pm – 7:55 pm',
      status = 'upcoming',
      track,
    } = req.body as Partial<LiveClassItem>;

    if (!title.trim()) {
      res.status(400).json({ error: 'Live class title is required.' });
      return;
    }

    const id = `live-adm-${Date.now()}`;
    db.prepare(
      `INSERT INTO live_classes (
        id, title, subject, instructor, instructor_role, instructor_avatar, status,
        scheduled_time, date_label, time_range, grade_label, language, track, chapter,
        attendees_count, whiteboard_notes_json, poll_question_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      title.trim(),
      subject,
      teacherRow.name,
      `${teacherRow.grade || 'Faculty'} · Sri Chaitanya Educational Institutions`,
      teacherRow.avatar_url || '/src/assets/images/mentor_physics_1794761540100.jpg',
      status,
      `Starts ${dateLabel} · ${timeRange}`,
      dateLabel,
      timeRange,
      gradeLabel,
      'ENGLISH',
      track || teacherRow.track,
      title.trim(),
      0,
      JSON.stringify([`Admin-scheduled session for ${teacherRow.name}: ${title.trim()}`]),
      JSON.stringify({
        prompt: `Quick Readiness Check for ${title.trim()}:`,
        options: [
          { id: 'a', label: 'Ready with NCERT basics', votes: 12 },
          { id: 'b', label: 'Need quick formula recap', votes: 8 },
        ],
      })
    );

    logAdminAction(
      req.user!,
      'SCHEDULE_FACULTY_CLASS',
      'teacher',
      teacherRow.id,
      `Scheduled "${title.trim()}" (${subject}) for ${teacherRow.name}.`
    );

    res.status(201).json({ ok: true, id });
  }
);

apiRouter.patch(
  '/admin/live-classes/:classId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { classId } = req.params;
    const { status, instructor, timeRange, dateLabel, gradeLabel } = req.body as {
      status?: 'live' | 'upcoming' | 'recorded';
      instructor?: string;
      timeRange?: string;
      dateLabel?: string;
      gradeLabel?: string;
    };
    const existing = db.prepare('SELECT * FROM live_classes WHERE id = ?').get(classId) as
      | {
          status: string;
          instructor: string;
          time_range: string;
          date_label: string;
          grade_label: string;
          title: string;
        }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Live class not found.' });
      return;
    }

    db.prepare(
      `UPDATE live_classes
       SET status = ?, instructor = ?, time_range = ?, date_label = ?, grade_label = ?
       WHERE id = ?`
    ).run(
      status || existing.status,
      instructor || existing.instructor,
      timeRange || existing.time_range,
      dateLabel || existing.date_label,
      gradeLabel || existing.grade_label,
      classId
    );

    logAdminAction(
      req.user!,
      'UPDATE_LIVE_CLASS',
      'live_class',
      classId,
      `Updated "${existing.title}" (status=${status || existing.status}, instructor=${instructor || existing.instructor}).`
    );

    res.json({ ok: true });
  }
);

apiRouter.get(
  '/admin/tests',
  requireAuth,
  requireAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    const mockRows = db.prepare('SELECT * FROM mock_tests ORDER BY rowid ASC').all() as Array<{
      id: string;
      title: string;
      category: MockTestTemplate['category'];
      subjects_json: string;
      duration_min: number;
      total_marks: number;
      negative_marking: number;
      difficulty: DifficultyLevel;
      question_ids_json: string;
    }>;

    const tests = mockRows.map((m) => {
      const agg = db
        .prepare(
          `SELECT COUNT(*) AS cnt,
                  COALESCE(AVG(score), 0) AS avgScore,
                  COALESCE(AVG(accuracy_percent), 0) AS avgAcc,
                  COALESCE(MAX(score), 0) AS highScore
           FROM test_attempts WHERE test_title = ?`
        )
        .get(m.title) as { cnt: number; avgScore: number; avgAcc: number; highScore: number };

      return {
        id: m.id,
        title: m.title,
        category: m.category,
        subjects: JSON.parse(m.subjects_json) as SubjectName[],
        durationMin: m.duration_min,
        totalMarks: m.total_marks,
        negativeMarking: m.negative_marking === 1,
        difficulty: m.difficulty,
        questionIds: JSON.parse(m.question_ids_json) as string[],
        attemptsCount: agg.cnt,
        avgScore: Math.round(agg.avgScore || 0),
        avgAccuracyPercent: Math.round(agg.avgAcc || 0),
        highestScore: agg.highScore || 0,
      };
    });

    res.json({ tests });
  }
);

apiRouter.get(
  '/admin/tests/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const testId = req.params.id;
    const mockRow = db.prepare('SELECT * FROM mock_tests WHERE id = ?').get(testId) as
      | {
          id: string;
          title: string;
          category: MockTestTemplate['category'];
          subjects_json: string;
          duration_min: number;
          total_marks: number;
          negative_marking: number;
          difficulty: DifficultyLevel;
          question_ids_json: string;
        }
      | undefined;

    if (!mockRow) {
      res.status(404).json({ error: 'Mock test not found.' });
      return;
    }

    const mockTest: MockTestTemplate = {
      id: mockRow.id,
      title: mockRow.title,
      category: mockRow.category,
      subjects: JSON.parse(mockRow.subjects_json) as SubjectName[],
      durationMin: mockRow.duration_min,
      totalMarks: mockRow.total_marks,
      negativeMarking: mockRow.negative_marking === 1,
      difficulty: mockRow.difficulty,
      questionIds: JSON.parse(mockRow.question_ids_json) as string[],
    };

    const qRows = db.prepare('SELECT * FROM questions ORDER BY rowid ASC').all() as Array<{
      id: string;
      subject: SubjectName;
      chapter_id: string;
      chapter_title: string;
      difficulty: DifficultyLevel;
      prompt: string;
      options_json: string;
      correct_index: number;
      explanation: string;
      formula_used: string;
      avg_time_sec: number;
    }>;

    const allQuestions: QuestionItem[] = qRows.map((q) => ({
      id: q.id,
      subject: q.subject,
      chapterId: q.chapter_id,
      chapterTitle: q.chapter_title,
      difficulty: q.difficulty,
      prompt: q.prompt,
      options: JSON.parse(q.options_json) as [string, string, string, string],
      correctIndex: q.correct_index,
      explanation: q.explanation,
      formulaUsed: q.formula_used,
      avgTimeSec: q.avg_time_sec,
    }));
    const qMap = new Map(allQuestions.map((q) => [q.id, q]));

    const attemptRows = db
      .prepare(
        `SELECT ta.*, u.name AS student_name, u.email AS student_email, u.admission_id AS admission_id, b.code AS batch_code
         FROM test_attempts ta
         LEFT JOIN users u ON u.id = ta.user_id
         LEFT JOIN batches b ON b.id = u.batch_id
         WHERE ta.test_title = ?
         ORDER BY ta.score DESC, ta.accuracy_percent DESC`
      )
      .all(mockTest.title) as Array<{
      id: string;
      user_id: string;
      student_name: string | null;
      student_email: string | null;
      admission_id: string | null;
      batch_code: string | null;
      test_title: string;
      category: string;
      date_label: string;
      score: number;
      max_score: number;
      accuracy_percent: number;
      time_spent_min: number;
      correct_count: number;
      incorrect_count: number;
      unattempted_count: number;
      subject_breakdown_json: string;
      responses_json: string | null;
      question_ids_json: string | null;
    }>;

    const attempts = attemptRows.map((a) => ({
      id: a.id,
      userId: a.user_id,
      studentName: a.student_name || 'Student',
      studentEmail: a.student_email || '',
      admissionId: a.admission_id || '',
      batchCode: a.batch_code || 'Unassigned',
      testTitle: a.test_title,
      category: a.category,
      dateLabel: a.date_label,
      score: a.score,
      maxScore: a.max_score,
      accuracyPercent: a.accuracy_percent,
      timeSpentMin: a.time_spent_min,
      correctCount: a.correct_count,
      incorrectCount: a.incorrect_count,
      unattemptedCount: a.unattempted_count,
      subjectBreakdown: JSON.parse(a.subject_breakdown_json) as TestAttemptRecord['subjectBreakdown'],
      responses: a.responses_json ? (JSON.parse(a.responses_json) as Record<string, number | null>) : undefined,
      questionIds: a.question_ids_json ? (JSON.parse(a.question_ids_json) as string[]) : undefined,
    }));

    const questionStats = mockTest.questionIds
      .map((qid) => qMap.get(qid))
      .filter((q): q is QuestionItem => Boolean(q))
      .map((question) => {
        let attemptsCount = 0;
        let correctCount = 0;
        let incorrectCount = 0;
        let unattemptedCount = 0;
        const optionCounts: [number, number, number, number] = [0, 0, 0, 0];

        for (const att of attempts) {
          if (!att.responses) continue;
          attemptsCount++;
          const ans = att.responses[question.id];
          if (ans === null || ans === undefined) {
            unattemptedCount++;
          } else {
            if (ans >= 0 && ans < 4) optionCounts[ans]++;
            if (ans === question.correctIndex) correctCount++;
            else incorrectCount++;
          }
        }

        const correctRatePercent =
          attemptsCount > 0 ? Math.round((correctCount / attemptsCount) * 100) : 0;

        return {
          question,
          attemptsCount,
          correctCount,
          incorrectCount,
          unattemptedCount,
          correctRatePercent,
          optionCounts,
        };
      });

    res.json({ mockTest, questionStats, attempts, allQuestions });
  }
);

apiRouter.patch(
  '/admin/mock-tests/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const testId = req.params.id;
    const existing = db.prepare('SELECT * FROM mock_tests WHERE id = ?').get(testId) as
      | {
          id: string;
          title: string;
          category: string;
          subjects_json: string;
          duration_min: number;
          negative_marking: number;
          difficulty: string;
          question_ids_json: string;
        }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Mock test not found.' });
      return;
    }

    const body = req.body as Partial<MockTestTemplate>;
    const nextTitle = body.title?.trim() || existing.title;
    const nextCategory = body.category || existing.category;
    const nextSubjects = Array.isArray(body.subjects)
      ? body.subjects
      : (JSON.parse(existing.subjects_json) as SubjectName[]);
    const nextDuration = typeof body.durationMin === 'number' ? body.durationMin : existing.duration_min;
    const nextNegative =
      typeof body.negativeMarking === 'boolean'
        ? body.negativeMarking
          ? 1
          : 0
        : existing.negative_marking;
    const nextDifficulty = body.difficulty || existing.difficulty;
    const nextQuestionIds = Array.isArray(body.questionIds)
      ? body.questionIds
      : (JSON.parse(existing.question_ids_json) as string[]);

    if (nextQuestionIds.length === 0) {
      res.status(400).json({ error: 'A mock test must include at least one question.' });
      return;
    }

    const totalMarks = nextQuestionIds.length * 4;
    db.prepare(
      `UPDATE mock_tests
       SET title = ?, category = ?, subjects_json = ?, duration_min = ?, total_marks = ?,
           negative_marking = ?, difficulty = ?, question_ids_json = ?
       WHERE id = ?`
    ).run(
      nextTitle,
      nextCategory,
      JSON.stringify(nextSubjects),
      nextDuration,
      totalMarks,
      nextNegative,
      nextDifficulty,
      JSON.stringify(nextQuestionIds),
      testId
    );

    logAdminAction(
      req.user!,
      'UPDATE_MOCK_TEST',
      'mock_test',
      testId,
      `Updated "${nextTitle}" (${nextQuestionIds.length} Qs · ${totalMarks} Marks · ${nextDuration} min).`
    );

    res.json({ ok: true });
  }
);

apiRouter.post(
  '/admin/mock-tests/:id/clone',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const existing = db.prepare('SELECT * FROM mock_tests WHERE id = ?').get(req.params.id) as
      | {
          title: string;
          category: string;
          subjects_json: string;
          duration_min: number;
          total_marks: number;
          negative_marking: number;
          difficulty: string;
          question_ids_json: string;
        }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Mock test not found.' });
      return;
    }
    const id = `mock-copy-${Date.now()}`;
    const newTitle = `${existing.title} (Copy)`;
    db.prepare(
      `INSERT INTO mock_tests (id, title, category, subjects_json, duration_min, total_marks, negative_marking, difficulty, question_ids_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      newTitle,
      existing.category,
      existing.subjects_json,
      existing.duration_min,
      existing.total_marks,
      existing.negative_marking,
      existing.difficulty,
      existing.question_ids_json
    );
    logAdminAction(
      req.user!,
      'CLONE_MOCK_TEST',
      'mock_test',
      id,
      `Cloned "${existing.title}" into "${newTitle}".`
    );
    res.status(201).json({ ok: true, id });
  }
);

apiRouter.get(
  '/admin/attempts',
  requireAuth,
  requireAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    const rows = db
      .prepare(
        `SELECT ta.*, u.name AS student_name, u.email AS student_email, u.admission_id AS admission_id, b.code AS batch_code
         FROM test_attempts ta
         LEFT JOIN users u ON u.id = ta.user_id
         LEFT JOIN batches b ON b.id = u.batch_id
         ORDER BY ta.created_at DESC, ta.rowid DESC`
      )
      .all() as Array<{
      id: string;
      user_id: string;
      student_name: string | null;
      student_email: string | null;
      admission_id: string | null;
      batch_code: string | null;
      test_title: string;
      category: string;
      date_label: string;
      score: number;
      max_score: number;
      accuracy_percent: number;
      time_spent_min: number;
      correct_count: number;
      incorrect_count: number;
      unattempted_count: number;
      subject_breakdown_json: string;
      responses_json: string | null;
      question_ids_json: string | null;
    }>;

    const attempts = rows.map((a) => ({
      id: a.id,
      userId: a.user_id,
      studentName: a.student_name || 'Student',
      studentEmail: a.student_email || '',
      admissionId: a.admission_id || '',
      batchCode: a.batch_code || 'Unassigned',
      testTitle: a.test_title,
      category: a.category,
      dateLabel: a.date_label,
      score: a.score,
      maxScore: a.max_score,
      accuracyPercent: a.accuracy_percent,
      timeSpentMin: a.time_spent_min,
      correctCount: a.correct_count,
      incorrectCount: a.incorrect_count,
      unattemptedCount: a.unattempted_count,
      subjectBreakdown: JSON.parse(a.subject_breakdown_json) as TestAttemptRecord['subjectBreakdown'],
      responses: a.responses_json ? (JSON.parse(a.responses_json) as Record<string, number | null>) : undefined,
      questionIds: a.question_ids_json ? (JSON.parse(a.question_ids_json) as string[]) : undefined,
    }));

    res.json({ attempts });
  }
);

apiRouter.get(
  '/admin/attempts/:attemptId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const a = db
      .prepare(
        `SELECT ta.*, u.name AS student_name, u.email AS student_email, u.admission_id AS admission_id, b.code AS batch_code
         FROM test_attempts ta
         LEFT JOIN users u ON u.id = ta.user_id
         LEFT JOIN batches b ON b.id = u.batch_id
         WHERE ta.id = ?`
      )
      .get(req.params.attemptId) as
      | {
          id: string;
          user_id: string;
          student_name: string | null;
          student_email: string | null;
          admission_id: string | null;
          batch_code: string | null;
          test_title: string;
          category: string;
          date_label: string;
          score: number;
          max_score: number;
          accuracy_percent: number;
          time_spent_min: number;
          correct_count: number;
          incorrect_count: number;
          unattempted_count: number;
          subject_breakdown_json: string;
          responses_json: string | null;
          question_ids_json: string | null;
        }
      | undefined;

    if (!a) {
      res.status(404).json({ error: 'Test attempt record not found.' });
      return;
    }

    const responses: Record<string, number | null> = a.responses_json
      ? (JSON.parse(a.responses_json) as Record<string, number | null>)
      : {};
    const questionIds: string[] = a.question_ids_json
      ? (JSON.parse(a.question_ids_json) as string[])
      : Object.keys(responses);

    const qRows = db.prepare('SELECT * FROM questions').all() as Array<{
      id: string;
      subject: SubjectName;
      chapter_id: string;
      chapter_title: string;
      difficulty: DifficultyLevel;
      prompt: string;
      options_json: string;
      correct_index: number;
      explanation: string;
      formula_used: string;
      avg_time_sec: number;
    }>;

    const qMap = new Map(
      qRows.map((q) => [
        q.id,
        {
          id: q.id,
          subject: q.subject,
          chapterId: q.chapter_id,
          chapterTitle: q.chapter_title,
          difficulty: q.difficulty,
          prompt: q.prompt,
          options: JSON.parse(q.options_json) as [string, string, string, string],
          correctIndex: q.correct_index,
          explanation: q.explanation,
          formulaUsed: q.formula_used,
          avgTimeSec: q.avg_time_sec,
        },
      ])
    );

    const items = questionIds
      .map((qid) => qMap.get(qid))
      .filter((q): q is QuestionItem => Boolean(q))
      .map((question) => {
        const selected = responses[question.id] ?? null;
        const isAttempted = selected !== null && selected !== undefined;
        return {
          question,
          selectedOptionIndex: isAttempted ? selected : null,
          isAttempted,
          isCorrect: isAttempted && selected === question.correctIndex,
        };
      });

    res.json({
      attempt: {
        id: a.id,
        userId: a.user_id,
        studentName: a.student_name || 'Student',
        studentEmail: a.student_email || '',
        admissionId: a.admission_id || '',
        batchCode: a.batch_code || 'Unassigned',
        testTitle: a.test_title,
        category: a.category,
        dateLabel: a.date_label,
        score: a.score,
        maxScore: a.max_score,
        accuracyPercent: a.accuracy_percent,
        timeSpentMin: a.time_spent_min,
        correctCount: a.correct_count,
        incorrectCount: a.incorrect_count,
        unattemptedCount: a.unattempted_count,
        subjectBreakdown: JSON.parse(a.subject_breakdown_json) as TestAttemptRecord['subjectBreakdown'],
        responses,
        questionIds,
      },
      items,
    });
  }
);

apiRouter.delete(
  '/admin/attempts/:attemptId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const existing = db
      .prepare('SELECT id, user_id, test_title FROM test_attempts WHERE id = ?')
      .get(req.params.attemptId) as { id: string; user_id: string; test_title: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    db.prepare('DELETE FROM test_attempts WHERE id = ?').run(req.params.attemptId);
    logAdminAction(
      req.user!,
      'VOID_TEST_ATTEMPT',
      'test_attempt',
      existing.id,
      `Voided attempt for "${existing.test_title}" (student ${existing.user_id}).`
    );
    res.json({ ok: true });
  }
);

apiRouter.post(
  '/admin/impersonate/:userId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const targetRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId) as unknown as
      | DbUserRow
      | undefined;
    if (!targetRow) {
      res.status(404).json({ error: 'Target account not found.' });
      return;
    }
    const token = createSessionForUser(targetRow.id, 'password');
    const profile = rowToProfile(targetRow, 'password');

    logAdminAction(
      req.user!,
      'IMPERSONATE_ACCOUNT',
      'user',
      targetRow.id,
      `Super Admin "${req.user!.name}" launched live ${profile.role} workspace as "${profile.name}".`
    );

    res.json({ token, user: profile });
  }
);

function normalizeDifficulty(raw?: string): DifficultyLevel {
  if (raw === 'Foundation' || raw === 'Moderate' || raw === 'Advanced') return raw;
  const lower = (raw || '').trim().toLowerCase();
  if (lower.startsWith('found') || lower === 'easy') return 'Foundation';
  if (lower.startsWith('adv') || lower === 'hard') return 'Advanced';
  return 'Moderate';
}

function normalizeSubject(raw?: string): SubjectName {
  const valid: SubjectName[] = [
    'Physics',
    'Chemistry',
    'Mathematics',
    'Biology',
    'English',
    'Vedic Mathematics',
    'Social Science',
  ];
  if (raw && valid.includes(raw as SubjectName)) return raw as SubjectName;
  const lower = (raw || '').trim().toLowerCase();
  if (lower.includes('chem')) return 'Chemistry';
  if (lower.includes('vedic')) return 'Vedic Mathematics';
  if (lower.includes('math')) return 'Mathematics';
  if (lower.includes('bio')) return 'Biology';
  if (lower.includes('eng')) return 'English';
  if (lower.includes('soc')) return 'Social Science';
  return 'Physics';
}

function normalizeLessonType(raw?: string): 'video' | 'notes' | 'practice' {
  if (raw === 'notes' || raw === 'practice') return raw;
  return 'video';
}

function normalizeLiveStatus(raw?: string): 'live' | 'upcoming' | 'recorded' {
  if (raw === 'live' || raw === 'recorded') return raw;
  return 'upcoming';
}

function normalizeBatchStatus(raw?: string): 'Active' | 'Upcoming' | 'Archived' {
  if (raw === 'Upcoming' || raw === 'Archived') return raw;
  return 'Active';
}

apiRouter.post(
  '/admin/inject',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const payload = (req.body || {}) as AdminInjectPayload;
    const batchTs = Date.now();
    let seq = 0;
    const nextSuffix = () => {
      seq += 1;
      return `${batchTs}-${seq}-${Math.floor(100 + Math.random() * 900)}`;
    };

    const counts: AdminInjectResult['counts'] = {
      questions: 0,
      dppSheets: 0,
      mockTests: 0,
      chapters: 0,
      lessons: 0,
      ncertSolutions: 0,
      flashcards: 0,
      liveClasses: 0,
      batches: 0,
      users: 0,
    };

    let createdDppId: string | undefined;
    let createdMockTestId: string | undefined;

    const upQuestionStmt = db.prepare(
      `INSERT OR REPLACE INTO questions (
        id, subject, chapter_id, chapter_title, difficulty, prompt,
        options_json, correct_index, explanation, formula_used, avg_time_sec
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const upsertQuestion = (
      q: Partial<QuestionItem>,
      defaultSubject: SubjectName,
      defaultChapterTitle: string
    ): string => {
      const prompt = (q.prompt || '').trim();
      if (!prompt) {
        throw new Error('Every injected question must include a non-empty prompt.');
      }
      const rawOpts = Array.isArray(q.options) ? q.options.map((o) => String(o ?? '').trim()) : [];
      if (rawOpts.length !== 4 || rawOpts.some((o) => !o)) {
        throw new Error(`Question "${prompt.slice(0, 40)}..." must include 4 non-empty options.`);
      }
      const id = (q.id || '').trim() || `q-inj-${nextSuffix()}`;
      const subject = normalizeSubject(q.subject || defaultSubject);
      const chapterTitle = (q.chapterTitle || '').trim() || defaultChapterTitle;
      const chapterId =
        (q.chapterId || '').trim() ||
        `ch-${chapterTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28) || 'general'}`;
      const correctIdx =
        typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3
          ? Math.floor(q.correctIndex)
          : 0;

      upQuestionStmt.run(
        id,
        subject,
        chapterId,
        chapterTitle,
        normalizeDifficulty(q.difficulty),
        prompt,
        JSON.stringify(rawOpts),
        correctIdx,
        (q.explanation || '').trim() || 'Verified institutional solution.',
        (q.formulaUsed || '').trim() || 'Core Concept',
        Math.max(10, Number(q.avgTimeSec) || 45)
      );
      counts.questions += 1;
      return id;
    };

    db.exec('BEGIN');
    try {
      // 1. One-Step Daily Quiz & Mock Test Bundle
      if (payload.dailyQuiz) {
        const dq = payload.dailyQuiz;
        const dqTitle = (dq.title || '').trim();
        if (!dqTitle || !Array.isArray(dq.questions) || dq.questions.length === 0) {
          throw new Error('Daily Quiz requires a title and at least one question.');
        }
        const dqSubject = normalizeSubject(dq.subject);
        const dqSubjects =
          Array.isArray(dq.subjects) && dq.subjects.length > 0
            ? dq.subjects.map((s) => normalizeSubject(s))
            : Array.from(
                new Set(dq.questions.map((q) => normalizeSubject(q.subject || dqSubject)))
              );

        const qIds: string[] = [];
        for (const q of dq.questions) {
          qIds.push(upsertQuestion(q, dqSubject, dqTitle));
        }

        const estMin = Math.max(5, Number(dq.durationMin) || Math.max(15, qIds.length * 3));
        const mode = dq.mode || 'dpp';

        if (mode === 'dpp' || mode === 'both') {
          createdDppId = `dpp-inj-${nextSuffix()}`;
          db.prepare(
            'INSERT OR REPLACE INTO dpp_sheets (id, title, subject, date_label, estimated_min, question_ids_json) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(
            createdDppId,
            dqTitle,
            dqSubject,
            (dq.dateLabel || '').trim() || 'Today',
            estMin,
            JSON.stringify(qIds)
          );
          counts.dppSheets += 1;
        }

        if (mode === 'mock_test' || mode === 'both') {
          createdMockTestId = `mock-inj-${nextSuffix()}`;
          const totalMarks = qIds.length * 4;
          db.prepare(
            `INSERT OR REPLACE INTO mock_tests (
              id, title, category, subjects_json, duration_min, total_marks,
              negative_marking, difficulty, question_ids_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            createdMockTestId,
            dqTitle,
            dq.category || 'Chapter Mastery',
            JSON.stringify(dqSubjects),
            estMin,
            totalMarks,
            dq.negativeMarking === false ? 0 : 1,
            normalizeDifficulty(dq.difficulty),
            JSON.stringify(qIds)
          );
          counts.mockTests += 1;
        }
      }

      // 2. Standalone Questions
      if (Array.isArray(payload.questions)) {
        for (const q of payload.questions) {
          upsertQuestion(q, 'Physics', 'Injected Practice Bank');
        }
      }

      // 3. Standalone DPP Sheets
      if (Array.isArray(payload.dppSheets)) {
        const upDpp = db.prepare(
          'INSERT OR REPLACE INTO dpp_sheets (id, title, subject, date_label, estimated_min, question_ids_json) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const d of payload.dppSheets) {
          const title = (d.title || '').trim();
          if (!title) continue;
          const id = (d.id || '').trim() || `dpp-inj-${nextSuffix()}`;
          const qIds = Array.isArray(d.questionIds) ? d.questionIds : [];
          upDpp.run(
            id,
            title,
            normalizeSubject(d.subject),
            (d.dateLabel || '').trim() || 'Today',
            Math.max(5, Number(d.estimatedMin) || Math.max(15, qIds.length * 3)),
            JSON.stringify(qIds)
          );
          counts.dppSheets += 1;
        }
      }

      // 4. Standalone Mock Tests
      if (Array.isArray(payload.mockTests)) {
        const upMock = db.prepare(
          `INSERT OR REPLACE INTO mock_tests (
            id, title, category, subjects_json, duration_min, total_marks,
            negative_marking, difficulty, question_ids_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const m of payload.mockTests) {
          const title = (m.title || '').trim();
          if (!title) continue;
          const id = (m.id || '').trim() || `mock-inj-${nextSuffix()}`;
          const qIds = Array.isArray(m.questionIds) ? m.questionIds : [];
          const subjects =
            Array.isArray(m.subjects) && m.subjects.length > 0
              ? m.subjects.map((s) => normalizeSubject(s))
              : (['Physics'] as SubjectName[]);
          const totalMarks = Number(m.totalMarks) || Math.max(4, qIds.length * 4);
          upMock.run(
            id,
            title,
            m.category || 'All India Test Series',
            JSON.stringify(subjects),
            Math.max(5, Number(m.durationMin) || 30),
            totalMarks,
            m.negativeMarking === false ? 0 : 1,
            normalizeDifficulty(m.difficulty),
            JSON.stringify(qIds)
          );
          counts.mockTests += 1;
        }
      }

      // 5. Chapters & Lessons
      if (Array.isArray(payload.chapters)) {
        const upCh = db.prepare(
          'INSERT OR REPLACE INTO chapters (id, subject, title, unit, weightage, mastery_percent, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        const upLes = db.prepare(
          `INSERT OR REPLACE INTO lessons (
            id, chapter_id, title, duration_min, type, instructor, summary,
            key_formulas_json, timestamps_json, notes_content, default_completed, default_bookmarked, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        payload.chapters.forEach((ch, idx) => {
          const title = (ch.title || '').trim();
          if (!title) return;
          const chId = (ch.id || '').trim() || `ch-inj-${nextSuffix()}`;
          upCh.run(
            chId,
            normalizeSubject(ch.subject),
            title,
            (ch.unit || '').trim() || 'Unit 1 · Core Syllabus',
            (ch.weightage || '').trim() || 'High Weightage',
            Number(ch.masteryPercent) || 0,
            idx + 20
          );
          counts.chapters += 1;

          const lessons = Array.isArray(ch.lessons) ? ch.lessons : [];
          lessons.forEach((les, lIdx) => {
            const lTitle = (les.title || '').trim();
            if (!lTitle) return;
            const lesId = (les.id || '').trim() || `les-inj-${nextSuffix()}`;
            upLes.run(
              lesId,
              chId,
              lTitle,
              Math.max(5, Number(les.durationMin) || 35),
              normalizeLessonType(les.type),
              (les.instructor || '').trim() || req.user!.name,
              (les.summary || '').trim() || `Faculty concept module on ${lTitle}.`,
              JSON.stringify(Array.isArray(les.keyFormulas) ? les.keyFormulas : []),
              JSON.stringify(
                Array.isArray(les.timestamps) && les.timestamps.length > 0
                  ? les.timestamps
                  : [{ time: '00:00', label: lTitle }]
              ),
              les.notesContent || `${lTitle}\nAdded via Infinity Admin Data Injector.`,
              les.completed ? 1 : 0,
              les.bookmarked ? 1 : 0,
              lIdx
            );
            counts.lessons += 1;
          });
        });
      }

      // 6. NCERT Solutions
      if (Array.isArray(payload.ncertSolutions)) {
        const upNcert = db.prepare(
          'INSERT OR REPLACE INTO ncert_solutions (id, subject, chapter, exercise_ref, question, solution_steps_json, final_answer) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        for (const n of payload.ncertSolutions) {
          const question = (n.question || '').trim();
          const chapter = (n.chapter || '').trim();
          const finalAnswer = (n.finalAnswer || '').trim();
          if (!question || !chapter || !finalAnswer) continue;
          const id = (n.id || '').trim() || `ncert-inj-${nextSuffix()}`;
          const steps =
            Array.isArray(n.solutionSteps) && n.solutionSteps.length > 0
              ? n.solutionSteps
              : [`1. Apply standard NCERT theorem for ${chapter}.`];
          upNcert.run(
            id,
            normalizeSubject(n.subject),
            chapter,
            (n.exerciseRef || '').trim() || 'NCERT Exercise',
            question,
            JSON.stringify(steps),
            finalAnswer
          );
          counts.ncertSolutions += 1;
        }
      }

      // 7. Flashcards
      if (Array.isArray(payload.flashcards)) {
        const upFc = db.prepare(
          'INSERT OR REPLACE INTO flashcards (id, subject, chapter, front, hint, back, formula, default_status, default_bookmarked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (const f of payload.flashcards) {
          const front = (f.front || '').trim();
          const back = (f.back || '').trim();
          if (!front || !back) continue;
          const id = (f.id || '').trim() || `fc-inj-${nextSuffix()}`;
          upFc.run(
            id,
            normalizeSubject(f.subject),
            (f.chapter || '').trim() || 'Core Revision',
            front,
            (f.hint || '').trim() || 'Recall core formula.',
            back,
            (f.formula || '').trim() || 'Concept Formula',
            f.status || 'new',
            f.bookmarked ? 1 : 0
          );
          counts.flashcards += 1;
        }
      }

      // 8. Live Classes
      if (Array.isArray(payload.liveClasses)) {
        const upLive = db.prepare(
          `INSERT OR REPLACE INTO live_classes (
            id, title, subject, instructor, instructor_role, instructor_avatar, status,
            scheduled_time, date_label, time_range, grade_label, language, track, chapter,
            attendees_count, whiteboard_notes_json, poll_question_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const cls of payload.liveClasses) {
          const title = (cls.title || '').trim();
          if (!title) continue;
          const id = (cls.id || '').trim() || `live-inj-${nextSuffix()}`;
          const timeRange = (cls.timeRange || '').trim() || '7:00 pm – 7:55 pm';
          upLive.run(
            id,
            title,
            normalizeSubject(cls.subject),
            (cls.instructor || '').trim() || req.user!.name,
            (cls.instructorRole || '').trim() || 'Faculty · Sri Chaitanya Educational Institutions',
            (cls.instructorAvatar || '').trim() || '/src/assets/images/mentor_physics_1794761540100.jpg',
            normalizeLiveStatus(cls.status),
            (cls.scheduledTime || '').trim() || `Starts Today · ${timeRange}`,
            (cls.dateLabel || '').trim() || 'Today',
            timeRange,
            (cls.gradeLabel || '').trim() || 'Class 12',
            (cls.language || '').trim() || 'ENGLISH',
            cls.track || 'IIT-JEE',
            (cls.chapter || '').trim() || title,
            Math.max(0, Number(cls.attendeesCount) || 120),
            JSON.stringify(Array.isArray(cls.whiteboardNotes) ? cls.whiteboardNotes : []),
            JSON.stringify(cls.pollQuestion || { prompt: 'Quick check?', options: [] })
          );
          counts.liveClasses += 1;
        }
      }

      // 9. Batches
      if (Array.isArray(payload.batches)) {
        const upBatch = db.prepare(
          `INSERT OR REPLACE INTO batches (
            id, code, name, track, campus, lead_faculty, student_count, capacity, schedule_slot, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const b of payload.batches as Array<Partial<BatchCohort>>) {
          const name = (b.name || '').trim();
          if (!name) continue;
          const code = ((b.code || '').trim() || `SC-INJ-${seq + 100}`).toUpperCase();
          const existingByCode = db
            .prepare('SELECT id FROM batches WHERE code = ?')
            .get(code) as { id: string } | undefined;
          const id = (b.id || '').trim() || existingByCode?.id || `batch-inj-${nextSuffix()}`;
          upBatch.run(
            id,
            code,
            name,
            b.track || 'IIT-JEE',
            (b.campus || '').trim() || 'Online National Live Cohort',
            (b.leadFaculty || '').trim() || 'Ekansh Mishra',
            Math.max(0, Number(b.studentCount) || 0),
            Math.max(10, Number(b.capacity) || 60),
            (b.scheduleSlot || '').trim() || 'Mon–Sat · 5:00 PM – 7:30 PM',
            normalizeBatchStatus(b.status)
          );
          counts.batches += 1;
        }
      }

      // 10. Users (Students / Faculty / Admins)
      if (Array.isArray(payload.users)) {
        const insertUser = db.prepare(
          `INSERT INTO users (
            id, role, name, initials, email, phone, admission_id, password_hash, dob_pin,
            track, program_name, grade, daily_goal_hours, streak_days, weekly_hours_logged,
            avatar_url, login_method, batch_id, campus, subjects_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const u of payload.users) {
          const name = (u.name || '').trim();
          if (!name) continue;
          const cleanEmail = (u.email || '').trim().toLowerCase() || null;
          const formattedPhone = (u.phone || '').trim() ? normalizePhone(u.phone!) : null;
          if (!cleanEmail && !formattedPhone) continue;

          const conflict = db
            .prepare(
              'SELECT id FROM users WHERE (email IS NOT NULL AND LOWER(email) = ?) OR (phone IS NOT NULL AND phone = ?)'
            )
            .get(cleanEmail || '', formattedPhone || '') as { id: string } | undefined;
          if (conflict) continue;

          const targetRole = normalizeRole(u.role);
          const prefix =
            targetRole === 'admin' ? 'IL-ADM' : targetRole === 'teacher' ? 'IL-FAC' : 'IL-STU';
          const id = (u.id || '').trim() || `${prefix}-${nextSuffix()}`;
          const track: ExamTrack = u.track || 'IIT-JEE';
          const admissionId =
            (u.admissionId || '').trim().toUpperCase() ||
            `${targetRole === 'admin' ? 'SC-ADM' : targetRole === 'teacher' ? 'SC-FAC' : 'SC-INJ'}-${Math.floor(
              1000 + Math.random() * 9000
            )}`;
          const programName =
            (u.programName || '').trim() ||
            (targetRole === 'admin'
              ? 'Infinity Learn Institutional Control Center'
              : targetRole === 'teacher'
              ? 'Sri Chaitanya Faculty Live Class Console'
              : track === 'NEET UG'
              ? 'NEET UG 2027 Target Medical Program'
              : track === 'CBSE Class 12'
              ? 'CBSE Class 12 Board Excellence Program'
              : track === 'CBSE Grade 10'
              ? 'CBSE Grade 10 Science Full Program'
              : 'IIT-JEE 2027 Comprehensive Program');

          insertUser.run(
            id,
            targetRole,
            name,
            computeInitials(name),
            cleanEmail,
            formattedPhone,
            admissionId,
            hashPassword(u.password || 'Infinity@2027'),
            (u.dobPin || '').trim() || '2009-05-14',
            track,
            programName,
            (u.grade || '').trim() ||
              (targetRole === 'admin'
                ? 'Campus Admin'
                : targetRole === 'teacher'
                ? 'Faculty Mentor'
                : 'Class 12'),
            4,
            1,
            0,
            targetRole === 'student'
              ? '/src/assets/images/avatar_student_1794761540782.jpg'
              : '/src/assets/images/mentor_physics_1794761540100.jpg',
            'password',
            (u.batchId || '').trim() || null,
            (u.campus || '').trim() || 'Online National Live Cohort',
            JSON.stringify(Array.isArray(u.subjects) ? u.subjects : [])
          );
          counts.users += 1;
        }
      }

      const totalUpserted =
        counts.questions +
        counts.dppSheets +
        counts.mockTests +
        counts.chapters +
        counts.lessons +
        counts.ncertSolutions +
        counts.flashcards +
        counts.liveClasses +
        counts.batches +
        counts.users;

      if (totalUpserted === 0) {
        throw new Error('No valid records found in injection payload.');
      }

      db.exec('COMMIT');

      logAdminAction(
        req.user!,
        'INJECT_INSTITUTIONAL_DATA',
        'database',
        createdMockTestId || createdDppId || 'bulk-inject',
        `Injected ${totalUpserted} records (${counts.questions} Qs, ${counts.dppSheets} DPPs, ${counts.mockTests} tests, ${counts.chapters} chapters, ${counts.liveClasses} classes, ${counts.users} users).`
      );

      const responsePayload: AdminInjectResult = {
        ok: true,
        totalUpserted,
        createdDppId,
        createdMockTestId,
        counts,
      };
      queryCache.clear();
      res.status(201).json(responsePayload);
    } catch (err) {
      db.exec('ROLLBACK');
      const message = err instanceof Error ? err.message : 'Data injection failed.';
      res.status(400).json({ error: message });
    }
  }
);

// ============================================================================
// 5. SECURITY SESSIONS, NOTIFICATIONS & GAMIFICATION
// ============================================================================

apiRouter.get('/auth/sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare('SELECT token, user_id, login_method, expires_at, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user!.id) as Array<{
    token: string;
    user_id: string;
    login_method: LoginMethod;
    expires_at: string;
    created_at: string;
  }>;

  const sessions: ActiveSessionInfo[] = rows.map((s) => ({
    tokenPrefix: s.token.slice(0, 12),
    userId: s.user_id,
    userName: req.user!.name,
    userRole: req.user!.role,
    loginMethod: s.login_method,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    isCurrent: req.sessionToken === s.token,
  }));
  res.json({ sessions });
});

apiRouter.delete(
  '/auth/sessions/:prefix',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const prefix = req.params.prefix;
    if (req.sessionToken && req.sessionToken.startsWith(prefix)) {
      res.status(400).json({ error: 'Cannot revoke your current active browser session.' });
      return;
    }
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token LIKE ?').run(
      req.user!.id,
      `${prefix}%`
    );
    res.json({ ok: true });
  }
);

apiRouter.post('/auth/password/reset', (req: Request, res: Response) => {
  const { identifier = '', newPassword = '' } = req.body as {
    identifier?: string;
    newPassword?: string;
  };
  const cleanId = identifier.trim().toLowerCase();
  if (!cleanId) {
    res.status(400).json({ error: 'Enter a registered email or Admission ID.' });
    return;
  }
  const user = db
    .prepare('SELECT id, email, name FROM users WHERE LOWER(email) = ? OR LOWER(admission_id) = ?')
    .get(cleanId, cleanId) as { id: string; email: string | null; name: string } | undefined;

  if (!user) {
    res.json({
      ok: true,
      message: `If an account matches "${identifier.trim()}", password recovery instructions have been dispatched.`,
    });
    return;
  }
  if (newPassword.trim().length >= 6) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(newPassword.trim()),
      user.id
    );
    res.json({
      ok: true,
      message: `Password updated for ${user.name}. You can sign in immediately with your new password.`,
    });
    return;
  }
  res.json({
    ok: true,
    message: `Password recovery link queued for ${user.email || user.name}. Enter a new password above (6+ chars) to reset immediately.`,
  });
});

apiRouter.get('/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare(
      `SELECT * FROM notifications
       WHERE user_id = ? OR user_id = 'ALL'
       ORDER BY rowid DESC LIMIT 40`
    )
    .all(req.user!.id) as Array<{
    id: string;
    user_id: string;
    title: string;
    body: string;
    category: NotificationItem['category'];
    is_read: number;
    created_at: string;
  }>;
  res.json({
    notifications: rows.map((n) => ({
      id: n.id,
      userId: n.user_id,
      title: n.title,
      body: n.body,
      category: n.category,
      isRead: n.is_read === 1,
      createdAt: n.created_at,
    })),
  });
});

apiRouter.post('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

apiRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id = 'ALL'").run(
    req.user!.id
  );
  res.json({ ok: true });
});

apiRouter.get('/gamification/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json(buildGamificationSummary(db, req.user!.id, req.user!.streakDays));
});

// ============================================================================
// 6. COURSE MARKETPLACE, COUPONS, CHECKOUT & INVOICE ENGINE
// ============================================================================

apiRouter.get('/marketplace/courses', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const courseRows = db
    .prepare("SELECT * FROM courses WHERE status = 'Published' ORDER BY is_featured DESC, rowid ASC")
    .all() as Array<{
    id: string;
    title: string;
    subtitle: string;
    track: ExamTrack;
    subject_focus: string;
    instructor: string;
    price_inr: number;
    mrp_inr: number;
    duration_months: number;
    rating: number;
    reviews_count: number;
    enrolled_count: number;
    badge: string;
    syllabus_highlights_json: string;
    is_featured: number;
    status: CourseItem['status'];
  }>;

  const courses: CourseItem[] = courseRows.map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    track: c.track,
    subjectFocus: c.subject_focus,
    instructor: c.instructor,
    priceInr: c.price_inr,
    mrpInr: c.mrp_inr,
    durationMonths: c.duration_months,
    rating: c.rating,
    reviewsCount: c.reviews_count,
    enrolledCount: c.enrolled_count,
    badge: c.badge,
    syllabusHighlights: JSON.parse(c.syllabus_highlights_json) as string[],
    isFeatured: c.is_featured === 1,
    status: c.status,
  }));

  const enrollmentRows = db
    .prepare('SELECT * FROM enrollments WHERE user_id = ? ORDER BY rowid DESC')
    .all(userId) as Array<{
    id: string;
    user_id: string;
    course_id: string;
    course_title: string;
    status: EnrollmentItem['status'];
    valid_until: string;
    progress_percent: number;
    enrolled_at: string;
  }>;

  const orderRows = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY rowid DESC')
    .all(userId) as Array<{
    id: string;
    user_id: string;
    course_id: string;
    course_title: string;
    amount_paid_inr: number;
    discount_inr: number;
    coupon_code: string | null;
    payment_method: OrderRecord['paymentMethod'];
    status: OrderRecord['status'];
    invoice_no: string;
    created_at: string;
  }>;

  res.json({
    courses,
    enrollments: enrollmentRows.map((e) => ({
      id: e.id,
      userId: e.user_id,
      courseId: e.course_id,
      courseTitle: e.course_title,
      status: e.status,
      validUntil: e.valid_until,
      progressPercent: e.progress_percent,
      enrolledAt: e.enrolled_at,
    })),
    orders: orderRows.map((o) => ({
      id: o.id,
      userId: o.user_id,
      courseId: o.course_id,
      courseTitle: o.course_title,
      amountPaidInr: o.amount_paid_inr,
      discountInr: o.discount_inr,
      couponCode: o.coupon_code,
      paymentMethod: o.payment_method,
      status: o.status,
      invoiceNo: o.invoice_no,
      createdAt: o.created_at,
    })),
  });
});

function computeCouponDiscount(coursePrice: number, rawCode?: string): {
  valid: boolean;
  code: string | null;
  discountInr: number;
  finalAmountInr: number;
  message: string;
} {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) {
    return { valid: true, code: null, discountInr: 0, finalAmountInr: coursePrice, message: '' };
  }
  const cp = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code) as
    | {
        code: string;
        discount_percent: number;
        max_discount_inr: number;
        min_order_inr: number;
        usage_limit: number;
        used_count: number;
        active: number;
        expires_at: string;
      }
    | undefined;
  if (!cp || cp.active !== 1) {
    return {
      valid: false,
      code: null,
      discountInr: 0,
      finalAmountInr: coursePrice,
      message: 'Coupon code is invalid or inactive.',
    };
  }
  if (cp.used_count >= cp.usage_limit) {
    return {
      valid: false,
      code: null,
      discountInr: 0,
      finalAmountInr: coursePrice,
      message: 'Coupon redemption limit reached.',
    };
  }
  if (coursePrice < cp.min_order_inr) {
    return {
      valid: false,
      code: null,
      discountInr: 0,
      finalAmountInr: coursePrice,
      message: `Minimum order value Rs. ${cp.min_order_inr} required for ${cp.code}.`,
    };
  }
  const rawDisc = Math.round((coursePrice * cp.discount_percent) / 100);
  const discountInr = Math.min(cp.max_discount_inr, rawDisc, coursePrice);
  return {
    valid: true,
    code: cp.code,
    discountInr,
    finalAmountInr: Math.max(0, coursePrice - discountInr),
    message: `Applied ${cp.code} (${cp.discount_percent}% off up to Rs. ${cp.max_discount_inr})`,
  };
}

apiRouter.post(
  '/marketplace/validate-coupon',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const { courseId = '', couponCode = '' } = req.body as {
      courseId?: string;
      couponCode?: string;
    };
    const course = db.prepare('SELECT price_inr FROM courses WHERE id = ?').get(courseId) as
      | { price_inr: number }
      | undefined;
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    const calc = computeCouponDiscount(course.price_inr, couponCode);
    if (!calc.valid) {
      res.status(400).json({ error: calc.message });
      return;
    }
    res.json(calc);
  }
);

apiRouter.post('/marketplace/checkout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const {
    courseId = '',
    couponCode = '',
    paymentMethod = 'UPI',
  } = req.body as {
    courseId?: string;
    couponCode?: string;
    paymentMethod?: OrderRecord['paymentMethod'];
  };

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as
    | { id: string; title: string; price_inr: number; duration_months: number }
    | undefined;
  if (!course) {
    res.status(404).json({ error: 'Course not found.' });
    return;
  }

  const already = db
    .prepare("SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? AND status = 'Active'")
    .get(userId, course.id) as { id: string } | undefined;
  if (already) {
    res.status(409).json({ error: 'You are already actively enrolled in this course.' });
    return;
  }

  const calc = computeCouponDiscount(course.price_inr, couponCode);
  if (!calc.valid) {
    res.status(400).json({ error: calc.message });
    return;
  }

  const now = new Date();
  const validDate = new Date(now);
  validDate.setMonth(validDate.getMonth() + (course.duration_months || 12));
  const validUntil = validDate.toISOString().slice(0, 10);
  const enrolledAt = now.toISOString().slice(0, 10);
  const createdAt = `${enrolledAt} ${now.toTimeString().slice(0, 5)}`;

  const orderId = `ORD-RS-${Date.now()}`;
  const enrollmentId = `enr-${Date.now()}`;
  const invoiceNo = `INV-RS-${Math.floor(100000 + Math.random() * 900000)}`;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO orders (
        id, user_id, course_id, course_title, amount_paid_inr, discount_inr,
        coupon_code, payment_method, status, invoice_no, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Paid', ?, ?)`
    ).run(
      orderId,
      userId,
      course.id,
      course.title,
      calc.finalAmountInr,
      calc.discountInr,
      calc.code,
      paymentMethod,
      invoiceNo,
      createdAt
    );

    db.prepare(
      `INSERT INTO enrollments (
        id, user_id, course_id, course_title, status, valid_until, progress_percent, enrolled_at
      ) VALUES (?, ?, ?, ?, 'Active', ?, 0, ?)`
    ).run(enrollmentId, userId, course.id, course.title, validUntil, enrolledAt);

    db.prepare('UPDATE courses SET enrolled_count = enrolled_count + 1 WHERE id = ?').run(course.id);

    if (calc.code) {
      db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').run(calc.code);
    }

    db.prepare(
      `INSERT INTO notifications (id, user_id, title, body, category, is_read, created_at)
       VALUES (?, ?, ?, ?, 'Payment', 0, ?)`
    ).run(
      `ntf-pay-${Date.now()}`,
      userId,
      `Enrollment Confirmed · ${course.title}`,
      `Payment of Rs. ${calc.finalAmountInr} succeeded (${invoiceNo}). Full batch access unlocked until ${validUntil}.`,
      'Just now'
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  recordLearningEvent(db, userId, 'COURSE_ENROLLED', 'course', course.id, 75, {
    amount: calc.finalAmountInr,
  });

  res.status(201).json({
    ok: true,
    order: {
      id: orderId,
      userId,
      courseId: course.id,
      courseTitle: course.title,
      amountPaidInr: calc.finalAmountInr,
      discountInr: calc.discountInr,
      couponCode: calc.code,
      paymentMethod,
      status: 'Paid',
      invoiceNo,
      createdAt,
    } satisfies OrderRecord,
    enrollment: {
      id: enrollmentId,
      userId,
      courseId: course.id,
      courseTitle: course.title,
      status: 'Active',
      validUntil,
      progressPercent: 0,
      enrolledAt,
    } satisfies EnrollmentItem,
  });
});

// ============================================================================
// 7. PEER + FACULTY COMMUNITY Q&A, MENTORSHIP & SCHOLARSHIP EXAMS
// ============================================================================

apiRouter.get('/community/posts', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const postRows = db.prepare('SELECT * FROM community_posts ORDER BY rowid DESC').all() as Array<{
    id: string;
    author_id: string;
    author_name: string;
    author_role: PortalRole;
    subject: SubjectName;
    chapter_title: string;
    title: string;
    body: string;
    upvotes: number;
    status: CommunityPost['status'];
    created_at: string;
  }>;

  const replyRows = db
    .prepare('SELECT * FROM community_replies ORDER BY rowid ASC')
    .all() as Array<{
    id: string;
    post_id: string;
    author_id: string;
    author_name: string;
    author_role: PortalRole;
    body: string;
    is_accepted: number;
    created_at: string;
  }>;

  const replyMap = new Map<string, CommunityReply[]>();
  for (const r of replyRows) {
    const arr = replyMap.get(r.post_id) || [];
    arr.push({
      id: r.id,
      postId: r.post_id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorRole: normalizeRole(r.author_role),
      body: r.body,
      isAccepted: r.is_accepted === 1,
      createdAt: r.created_at,
    });
    replyMap.set(r.post_id, arr);
  }

  const posts: CommunityPost[] = postRows.map((p) => ({
    id: p.id,
    authorId: p.author_id,
    authorName: p.author_name,
    authorRole: normalizeRole(p.author_role),
    subject: p.subject,
    chapterTitle: p.chapter_title,
    title: p.title,
    body: p.body,
    upvotes: p.upvotes,
    status: p.status,
    createdAt: p.created_at,
    replies: replyMap.get(p.id) || [],
  }));

  res.json({ posts });
});

apiRouter.post('/community/posts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const {
    subject = 'Physics',
    chapterTitle = 'Core Concept',
    title = '',
    body = '',
  } = req.body as {
    subject?: SubjectName;
    chapterTitle?: string;
    title?: string;
    body?: string;
  };
  if (!title.trim() || !body.trim()) {
    res.status(400).json({ error: 'Post title and detailed question body are required.' });
    return;
  }
  const id = `post-${Date.now()}`;
  const createdAt = 'Just now';
  db.prepare(
    `INSERT INTO community_posts (
      id, author_id, author_name, author_role, subject, chapter_title, title, body, upvotes, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Open', ?)`
  ).run(
    id,
    req.user!.id,
    req.user!.name,
    req.user!.role,
    normalizeSubject(subject),
    chapterTitle.trim() || 'Core Concept',
    title.trim(),
    body.trim(),
    createdAt
  );
  recordLearningEvent(db, req.user!.id, 'COMMUNITY_POST', 'community_post', id, 20);
  res.status(201).json({
    post: {
      id,
      authorId: req.user!.id,
      authorName: req.user!.name,
      authorRole: req.user!.role,
      subject: normalizeSubject(subject),
      chapterTitle: chapterTitle.trim() || 'Core Concept',
      title: title.trim(),
      body: body.trim(),
      upvotes: 1,
      status: 'Open',
      createdAt,
      replies: [],
    } satisfies CommunityPost,
  });
});

apiRouter.post(
  '/community/posts/:id/reply',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const postId = req.params.id;
    const { body = '' } = req.body as { body?: string };
    if (!body.trim()) {
      res.status(400).json({ error: 'Reply text cannot be empty.' });
      return;
    }
    const postExists = db.prepare('SELECT id FROM community_posts WHERE id = ?').get(postId);
    if (!postExists) {
      res.status(404).json({ error: 'Community post not found.' });
      return;
    }
    const id = `rep-${Date.now()}`;
    const isFaculty = req.user!.role === 'teacher' || req.user!.role === 'admin';
    db.prepare(
      `INSERT INTO community_replies (
        id, post_id, author_id, author_name, author_role, body, is_accepted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Just now')`
    ).run(id, postId, req.user!.id, req.user!.name, req.user!.role, body.trim(), isFaculty ? 1 : 0);

    if (isFaculty) {
      db.prepare("UPDATE community_posts SET status = 'Resolved' WHERE id = ?").run(postId);
    }
    recordLearningEvent(db, req.user!.id, 'COMMUNITY_REPLY', 'community_reply', id, 15);

    res.status(201).json({
      reply: {
        id,
        postId,
        authorId: req.user!.id,
        authorName: req.user!.name,
        authorRole: req.user!.role,
        body: body.trim(),
        isAccepted: isFaculty,
        createdAt: 'Just now',
      } satisfies CommunityReply,
    });
  }
);

apiRouter.post(
  '/community/posts/:id/upvote',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    db.prepare('UPDATE community_posts SET upvotes = upvotes + 1 WHERE id = ?').run(req.params.id);
    const updated = db
      .prepare('SELECT upvotes FROM community_posts WHERE id = ?')
      .get(req.params.id) as { upvotes: number } | undefined;
    res.json({ ok: true, upvotes: updated?.upvotes ?? 1 });
  }
);

apiRouter.patch(
  '/community/posts/:id/status',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const { status = 'Resolved' } = req.body as { status?: CommunityPost['status'] };
    db.prepare('UPDATE community_posts SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true, status });
  }
);

apiRouter.get('/mentorship/sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const isStaff = req.user!.role === 'teacher' || req.user!.role === 'admin';
  const rows = (
    isStaff
      ? db.prepare('SELECT * FROM mentorship_sessions ORDER BY rowid DESC').all()
      : db
          .prepare('SELECT * FROM mentorship_sessions WHERE student_id = ? ORDER BY rowid DESC')
          .all(req.user!.id)
  ) as Array<{
    id: string;
    student_id: string;
    student_name: string;
    mentor_name: string;
    mentor_role: string;
    topic: string;
    scheduled_slot: string;
    status: MentorshipSession['status'];
    action_notes: string;
    created_at: string;
  }>;

  res.json({
    sessions: rows.map((m) => ({
      id: m.id,
      studentId: m.student_id,
      studentName: m.student_name,
      mentorName: m.mentor_name,
      mentorRole: m.mentor_role,
      topic: m.topic,
      scheduledSlot: m.scheduled_slot,
      status: m.status,
      actionNotes: m.action_notes,
      createdAt: m.created_at,
    })),
  });
});

apiRouter.post('/mentorship/sessions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const {
    mentorName = 'Prof. Priya Menon',
    mentorRole = 'Senior Physics HoD · IIT-JEE',
    topic = '',
    scheduledSlot = 'Tomorrow · 6:00 PM IST',
    studentId,
    studentName,
  } = req.body as {
    mentorName?: string;
    mentorRole?: string;
    topic?: string;
    scheduledSlot?: string;
    studentId?: string;
    studentName?: string;
  };
  if (!topic.trim()) {
    res.status(400).json({ error: 'Mentorship agenda/topic is required.' });
    return;
  }
  const id = `mnt-${Date.now()}`;
  const targetStuId =
    (req.user!.role === 'teacher' || req.user!.role === 'admin') && studentId
      ? studentId
      : req.user!.id;
  const targetStuName =
    (req.user!.role === 'teacher' || req.user!.role === 'admin') && studentName
      ? studentName
      : req.user!.name;
  const createdAt = new Date().toISOString().slice(0, 10);

  db.prepare(
    `INSERT INTO mentorship_sessions (
      id, student_id, student_name, mentor_name, mentor_role, topic, scheduled_slot, status, action_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled', '1-on-1 strategy session confirmed.', ?)`
  ).run(id, targetStuId, targetStuName, mentorName, mentorRole, topic.trim(), scheduledSlot, createdAt);

  recordLearningEvent(db, targetStuId, 'MENTORSHIP_BOOKED', 'mentorship', id, 20);
  res.status(201).json({
    session: {
      id,
      studentId: targetStuId,
      studentName: targetStuName,
      mentorName,
      mentorRole,
      topic: topic.trim(),
      scheduledSlot,
      status: 'Scheduled',
      actionNotes: '1-on-1 strategy session confirmed.',
      createdAt,
    } satisfies MentorshipSession,
  });
});

apiRouter.get('/scholarships', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schRows = db.prepare('SELECT * FROM scholarships ORDER BY rowid ASC').all() as Array<{
    id: string;
    title: string;
    code: string;
    track: ExamTrack;
    exam_date_label: string;
    duration_min: number;
    max_scholarship_percent: number;
    prize_pool: string;
    registered_count: number;
    status: ScholarshipExam['status'];
  }>;

  const regRows = db
    .prepare('SELECT scholarship_id, admit_card_code FROM scholarship_registrations WHERE user_id = ?')
    .all(req.user!.id) as Array<{ scholarship_id: string; admit_card_code: string }>;
  const regMap = new Map(regRows.map((r) => [r.scholarship_id, r.admit_card_code]));

  const scholarships: ScholarshipExam[] = schRows.map((s) => ({
    id: s.id,
    title: s.title,
    code: s.code,
    track: s.track,
    examDateLabel: s.exam_date_label,
    durationMin: s.duration_min,
    maxScholarshipPercent: s.max_scholarship_percent,
    prizePool: s.prize_pool,
    registeredCount: s.registered_count,
    status: s.status,
    isRegistered: regMap.has(s.id),
    admitCardCode: regMap.get(s.id),
  }));

  res.json({ scholarships });
});

apiRouter.post(
  '/scholarships/:id/register',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const schId = req.params.id;
    const sch = db.prepare('SELECT * FROM scholarships WHERE id = ?').get(schId) as
      | { id: string; code: string; title: string }
      | undefined;
    if (!sch) {
      res.status(404).json({ error: 'Scholarship exam not found.' });
      return;
    }
    const existing = db
      .prepare(
        'SELECT admit_card_code FROM scholarship_registrations WHERE scholarship_id = ? AND user_id = ?'
      )
      .get(schId, req.user!.id) as { admit_card_code: string } | undefined;
    if (existing) {
      res.json({ ok: true, admitCardCode: existing.admit_card_code });
      return;
    }

    const admitCardCode = `${sch.code}-${Math.floor(100000 + Math.random() * 900000)}`;
    db.prepare(
      'INSERT INTO scholarship_registrations (scholarship_id, user_id, admit_card_code) VALUES (?, ?, ?)'
    ).run(schId, req.user!.id, admitCardCode);
    db.prepare('UPDATE scholarships SET registered_count = registered_count + 1 WHERE id = ?').run(
      schId
    );
    recordLearningEvent(db, req.user!.id, 'SCHOLARSHIP_REGISTERED', 'scholarship', schId, 40);
    res.status(201).json({ ok: true, admitCardCode });
  }
);

// ============================================================================
// 8. PARENT TELEMETRY PORTAL API
// ============================================================================

apiRouter.get('/parent/dashboard', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role !== 'parent' && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Parent or Administrator role required.' });
    return;
  }

  let linkRows = db
    .prepare('SELECT student_id FROM parent_student_links WHERE parent_id = ?')
    .all(req.user!.id) as Array<{ student_id: string }>;

  if (linkRows.length === 0) {
    // Fallback to top seeded students for preview admins/parents
    linkRows = [{ student_id: 'IL-2027-88412' }, { student_id: 'IL-STU-4420' }];
  }

  const totalLessons = (db.prepare('SELECT COUNT(*) AS c FROM lessons').get() as { c: number }).c;
  const chapterRows = db
    .prepare('SELECT id, title, subject, mastery_percent FROM chapters ORDER BY sort_order ASC')
    .all() as Array<{ id: string; title: string; subject: SubjectName; mastery_percent: number }>;

  const linkedChildren: ParentDashboardPayload['linkedChildren'] = [];

  for (const l of linkRows) {
    const stuRow = db.prepare('SELECT * FROM users WHERE id = ?').get(l.student_id) as unknown as
      | (DbUserRow & { created_at: string })
      | undefined;
    if (!stuRow) continue;

    const batchRow = stuRow.batch_id
      ? (db.prepare('SELECT * FROM batches WHERE id = ?').get(stuRow.batch_id) as
          | {
              id: string;
              code: string;
              name: string;
              track: ExamTrack;
              campus: string;
              lead_faculty: string;
              student_count: number;
              capacity: number;
              schedule_slot: string;
              status: BatchCohort['status'];
            }
          | undefined)
      : undefined;

    const attemptRows = db
      .prepare('SELECT * FROM test_attempts WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(stuRow.id) as Array<{
      id: string;
      test_title: string;
      category: string;
      date_label: string;
      score: number;
      max_score: number;
      accuracy_percent: number;
      time_spent_min: number;
      correct_count: number;
      incorrect_count: number;
      unattempted_count: number;
      subject_breakdown_json: string;
    }>;

    const avgAcc =
      attemptRows.length > 0
        ? Math.round(attemptRows.reduce((s, a) => s + a.accuracy_percent, 0) / attemptRows.length)
        : 0;

    const doneLessons = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM lessons l
           LEFT JOIN user_lesson_progress ulp ON ulp.lesson_id = l.id AND ulp.user_id = ?
           WHERE COALESCE(ulp.completed, l.default_completed) = 1`
        )
        .get(stuRow.id) as { c: number }
    ).c;

    const mntRows = db
      .prepare('SELECT * FROM mentorship_sessions WHERE student_id = ? ORDER BY rowid DESC')
      .all(stuRow.id) as Array<{
      id: string;
      student_id: string;
      student_name: string;
      mentor_name: string;
      mentor_role: string;
      topic: string;
      scheduled_slot: string;
      status: MentorshipSession['status'];
      action_notes: string;
      created_at: string;
    }>;

    const orderRows = db
      .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY rowid DESC')
      .all(stuRow.id) as Array<{
      id: string;
      user_id: string;
      course_id: string;
      course_title: string;
      amount_paid_inr: number;
      discount_inr: number;
      coupon_code: string | null;
      payment_method: OrderRecord['paymentMethod'];
      status: OrderRecord['status'];
      invoice_no: string;
      created_at: string;
    }>;

    const enrRows = db
      .prepare('SELECT * FROM enrollments WHERE user_id = ? ORDER BY rowid DESC')
      .all(stuRow.id) as Array<{
      id: string;
      user_id: string;
      course_id: string;
      course_title: string;
      status: EnrollmentItem['status'];
      valid_until: string;
      progress_percent: number;
      enrolled_at: string;
    }>;

    const studentRecord: AdminUserRecord = {
      id: stuRow.id,
      role: normalizeRole(stuRow.role),
      name: stuRow.name,
      initials: stuRow.initials,
      email: stuRow.email || '',
      phone: stuRow.phone || '',
      admissionId: stuRow.admission_id || '',
      track: stuRow.track,
      programName: stuRow.program_name,
      grade: stuRow.grade,
      streakDays: stuRow.streak_days,
      weeklyHoursLogged: stuRow.weekly_hours_logged,
      createdAt: stuRow.created_at,
      batchId: stuRow.batch_id || undefined,
      batchCode: batchRow?.code,
      batchName: batchRow?.name,
      campus: stuRow.campus || undefined,
      subjects: parseSubjects(stuRow.subjects_json),
    };

    linkedChildren.push({
      student: studentRecord,
      batch: batchRow
        ? {
            id: batchRow.id,
            code: batchRow.code,
            name: batchRow.name,
            track: batchRow.track,
            campus: batchRow.campus,
            leadFaculty: batchRow.lead_faculty,
            studentCount: batchRow.student_count,
            capacity: batchRow.capacity,
            scheduleSlot: batchRow.schedule_slot,
            status: batchRow.status,
          }
        : null,
      testsTaken: attemptRows.length,
      avgAccuracyPercent: avgAcc,
      lessonsCompleted: doneLessons,
      totalLessons,
      attendancePercent: Math.min(99, 86 + (stuRow.streak_days % 12)),
      weakChapters: chapterRows
        .filter((c) => c.mastery_percent < 75)
        .slice(0, 3)
        .map((c) => ({ title: c.title, subject: c.subject, masteryPercent: c.mastery_percent })),
      recentAttempts: attemptRows.slice(0, 6).map((a) => ({
        id: a.id,
        testTitle: a.test_title,
        category: a.category,
        dateLabel: a.date_label,
        score: a.score,
        maxScore: a.max_score,
        accuracyPercent: a.accuracy_percent,
        timeSpentMin: a.time_spent_min,
        correctCount: a.correct_count,
        incorrectCount: a.incorrect_count,
        unattemptedCount: a.unattempted_count,
        subjectBreakdown: JSON.parse(a.subject_breakdown_json) as TestAttemptRecord['subjectBreakdown'],
      })),
      mentorshipSessions: mntRows.map((m) => ({
        id: m.id,
        studentId: m.student_id,
        studentName: m.student_name,
        mentorName: m.mentor_name,
        mentorRole: m.mentor_role,
        topic: m.topic,
        scheduledSlot: m.scheduled_slot,
        status: m.status,
        actionNotes: m.action_notes,
        createdAt: m.created_at,
      })),
      orders: orderRows.map((o) => ({
        id: o.id,
        userId: o.user_id,
        courseId: o.course_id,
        courseTitle: o.course_title,
        amountPaidInr: o.amount_paid_inr,
        discountInr: o.discount_inr,
        couponCode: o.coupon_code,
        paymentMethod: o.payment_method,
        status: o.status,
        invoiceNo: o.invoice_no,
        createdAt: o.created_at,
      })),
      enrollments: enrRows.map((e) => ({
        id: e.id,
        userId: e.user_id,
        courseId: e.course_id,
        courseTitle: e.course_title,
        status: e.status,
        validUntil: e.valid_until,
        progressPercent: e.progress_percent,
        enrolledAt: e.enrolled_at,
      })),
    });
  }

  res.json({ parent: req.user!, linkedChildren } satisfies ParentDashboardPayload);
});

// ============================================================================
// 9. SUPER ADMIN MASTER OS CONTROL, COMMERCE, HEALTH & DB EXPLORER
// ============================================================================

apiRouter.get('/admin/config', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ config: getPlatformConfig() });
});

apiRouter.patch(
  '/admin/config',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const current = getPlatformConfig();
    const body = req.body as Partial<PlatformConfig>;
    const next: PlatformConfig = {
      institutionName: (body.institutionName ?? current.institutionName).trim() || 'Ramu School',
      tagline: (body.tagline ?? current.tagline).trim() || current.tagline,
      maintenanceMode:
        typeof body.maintenanceMode === 'boolean' ? body.maintenanceMode : current.maintenanceMode,
      allowPublicSignup:
        typeof body.allowPublicSignup === 'boolean'
          ? body.allowPublicSignup
          : current.allowPublicSignup,
      aiMentorEnabled:
        typeof body.aiMentorEnabled === 'boolean' ? body.aiMentorEnabled : current.aiMentorEnabled,
      marketplaceEnabled:
        typeof body.marketplaceEnabled === 'boolean'
          ? body.marketplaceEnabled
          : current.marketplaceEnabled,
      communityEnabled:
        typeof body.communityEnabled === 'boolean'
          ? body.communityEnabled
          : current.communityEnabled,
      parentPortalEnabled:
        typeof body.parentPortalEnabled === 'boolean'
          ? body.parentPortalEnabled
          : current.parentPortalEnabled,
      scholarshipOpen:
        typeof body.scholarshipOpen === 'boolean' ? body.scholarshipOpen : current.scholarshipOpen,
      maxSessionsPerUser: Math.min(
        20,
        Math.max(1, Number(body.maxSessionsPerUser ?? current.maxSessionsPerUser) || 5)
      ),
    };

    db.prepare(
      `UPDATE platform_config SET
        institution_name = ?, tagline = ?, maintenance_mode = ?, allow_public_signup = ?,
        ai_mentor_enabled = ?, marketplace_enabled = ?, community_enabled = ?,
        parent_portal_enabled = ?, scholarship_open = ?, max_sessions_per_user = ?,
        updated_at = datetime('now')
       WHERE id = 1`
    ).run(
      next.institutionName,
      next.tagline,
      next.maintenanceMode ? 1 : 0,
      next.allowPublicSignup ? 1 : 0,
      next.aiMentorEnabled ? 1 : 0,
      next.marketplaceEnabled ? 1 : 0,
      next.communityEnabled ? 1 : 0,
      next.parentPortalEnabled ? 1 : 0,
      next.scholarshipOpen ? 1 : 0,
      next.maxSessionsPerUser
    );
    queryCache.invalidatePrefix('platform_config');
    logAdminAction(
      req.user!,
      'UPDATE_PLATFORM_CONFIG',
      'platform_config',
      '1',
      `Updated OS settings (${next.institutionName}, maintenance=${next.maintenanceMode}, maxSessions=${next.maxSessionsPerUser}).`
    );
    res.json({ ok: true, config: getPlatformConfig() });
  }
);

apiRouter.get(
  '/admin/commerce',
  requireAuth,
  requireAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    const courseRows = db.prepare('SELECT * FROM courses ORDER BY rowid DESC').all() as Array<{
      id: string;
      title: string;
      subtitle: string;
      track: ExamTrack;
      subject_focus: string;
      instructor: string;
      price_inr: number;
      mrp_inr: number;
      duration_months: number;
      rating: number;
      reviews_count: number;
      enrolled_count: number;
      badge: string;
      syllabus_highlights_json: string;
      is_featured: number;
      status: CourseItem['status'];
    }>;

    const couponRows = db.prepare('SELECT * FROM coupons ORDER BY code ASC').all() as Array<{
      code: string;
      discount_percent: number;
      max_discount_inr: number;
      min_order_inr: number;
      usage_limit: number;
      used_count: number;
      active: number;
      expires_at: string;
    }>;

    const orderRows = db
      .prepare(
        `SELECT o.*, u.name AS student_name, u.email AS student_email
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         ORDER BY o.rowid DESC`
      )
      .all() as Array<{
      id: string;
      user_id: string;
      student_name: string | null;
      student_email: string | null;
      course_id: string;
      course_title: string;
      amount_paid_inr: number;
      discount_inr: number;
      coupon_code: string | null;
      payment_method: OrderRecord['paymentMethod'];
      status: OrderRecord['status'];
      invoice_no: string;
      created_at: string;
    }>;

    const enrRows = db
      .prepare('SELECT * FROM enrollments ORDER BY rowid DESC')
      .all() as Array<{
      id: string;
      user_id: string;
      course_id: string;
      course_title: string;
      status: EnrollmentItem['status'];
      valid_until: string;
      progress_percent: number;
      enrolled_at: string;
    }>;

    const orders: OrderRecord[] = orderRows.map((o) => ({
      id: o.id,
      userId: o.user_id,
      studentName: o.student_name || 'Student',
      studentEmail: o.student_email || '',
      courseId: o.course_id,
      courseTitle: o.course_title,
      amountPaidInr: o.amount_paid_inr,
      discountInr: o.discount_inr,
      couponCode: o.coupon_code,
      paymentMethod: o.payment_method,
      status: o.status,
      invoiceNo: o.invoice_no,
      createdAt: o.created_at,
    }));

    const paidOrders = orders.filter((o) => o.status === 'Paid');
    const payload: AdminCommercePayload = {
      courses: courseRows.map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: c.subtitle,
        track: c.track,
        subjectFocus: c.subject_focus,
        instructor: c.instructor,
        priceInr: c.price_inr,
        mrpInr: c.mrp_inr,
        durationMonths: c.duration_months,
        rating: c.rating,
        reviewsCount: c.reviews_count,
        enrolledCount: c.enrolled_count,
        badge: c.badge,
        syllabusHighlights: JSON.parse(c.syllabus_highlights_json) as string[],
        isFeatured: c.is_featured === 1,
        status: c.status,
      })),
      coupons: couponRows.map((cp) => ({
        code: cp.code,
        discountPercent: cp.discount_percent,
        maxDiscountInr: cp.max_discount_inr,
        minOrderInr: cp.min_order_inr,
        usageLimit: cp.usage_limit,
        usedCount: cp.used_count,
        active: cp.active === 1,
        expiresAt: cp.expires_at,
      })),
      orders,
      enrollments: enrRows.map((e) => ({
        id: e.id,
        userId: e.user_id,
        courseId: e.course_id,
        courseTitle: e.course_title,
        status: e.status,
        validUntil: e.valid_until,
        progressPercent: e.progress_percent,
        enrolledAt: e.enrolled_at,
      })),
      revenueSummary: {
        totalRevenueInr: paidOrders.reduce((s, o) => s + o.amountPaidInr, 0),
        paidOrdersCount: paidOrders.length,
        refundedOrdersCount: orders.filter((o) => o.status === 'Refunded').length,
        activeEnrollmentsCount: enrRows.filter((e) => e.status === 'Active').length,
      },
    };
    res.json(payload);
  }
);

apiRouter.post(
  '/admin/courses',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const c = req.body as Partial<CourseItem>;
    if (!c.title?.trim() || typeof c.priceInr !== 'number') {
      res.status(400).json({ error: 'Course title and priceInr are required.' });
      return;
    }
    const id = c.id?.trim() || `crs-${Date.now()}`;
    db.prepare(
      `INSERT OR REPLACE INTO courses (
        id, title, subtitle, track, subject_focus, instructor, price_inr, mrp_inr,
        duration_months, rating, reviews_count, enrolled_count, badge, syllabus_highlights_json,
        is_featured, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      c.title.trim(),
      (c.subtitle || '').trim() || 'Complete live classes, AITS tests & AINA mentoring',
      c.track || 'IIT-JEE',
      (c.subjectFocus || '').trim() || 'Physics · Chemistry · Maths',
      (c.instructor || '').trim() || req.user!.name,
      Math.max(0, Math.round(c.priceInr)),
      Math.max(Math.round(c.mrpInr || c.priceInr * 1.5), Math.round(c.priceInr)),
      Math.max(1, Number(c.durationMonths) || 12),
      Number(c.rating) || 4.8,
      Number(c.reviewsCount) || 120,
      Number(c.enrolledCount) || 0,
      (c.badge || '').trim() || 'New Batch',
      JSON.stringify(
        Array.isArray(c.syllabusHighlights) && c.syllabusHighlights.length > 0
          ? c.syllabusHighlights
          : ['Live Interactive Faculty Lectures', 'NTA CBT Mock Tests & DPP Sheets']
      ),
      c.isFeatured ? 1 : 0,
      c.status || 'Published'
    );
    logAdminAction(req.user!, 'CREATE_COURSE', 'course', id, `Created course "${c.title.trim()}".`);
    res.status(201).json({ ok: true, id });
  }
);

apiRouter.patch(
  '/admin/courses/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id;
    const body = req.body as Partial<CourseItem>;
    const existing = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as
      | { status: string; price_inr: number; is_featured: number; title: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    db.prepare('UPDATE courses SET status = ?, price_inr = ?, is_featured = ? WHERE id = ?').run(
      body.status || existing.status,
      typeof body.priceInr === 'number' ? Math.max(0, body.priceInr) : existing.price_inr,
      typeof body.isFeatured === 'boolean' ? (body.isFeatured ? 1 : 0) : existing.is_featured,
      id
    );
    logAdminAction(req.user!, 'UPDATE_COURSE', 'course', id, `Updated course "${existing.title}".`);
    res.json({ ok: true });
  }
);

apiRouter.delete(
  '/admin/courses/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
    logAdminAction(req.user!, 'DELETE_COURSE', 'course', req.params.id, `Deleted course ${req.params.id}.`);
    res.json({ ok: true });
  }
);

apiRouter.post(
  '/admin/coupons',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const cp = req.body as Partial<CouponItem>;
    const code = (cp.code || '').trim().toUpperCase();
    if (!code || typeof cp.discountPercent !== 'number') {
      res.status(400).json({ error: 'Coupon code and discountPercent are required.' });
      return;
    }
    db.prepare(
      `INSERT OR REPLACE INTO coupons (
        code, discount_percent, max_discount_inr, min_order_inr, usage_limit, used_count, active, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      code,
      Math.min(95, Math.max(1, Math.round(cp.discountPercent))),
      Math.max(100, Number(cp.maxDiscountInr) || 5000),
      Math.max(0, Number(cp.minOrderInr) || 500),
      Math.max(1, Number(cp.usageLimit) || 500),
      Number(cp.usedCount) || 0,
      cp.active === false ? 0 : 1,
      (cp.expiresAt || '').trim() || '2027-06-30'
    );
    logAdminAction(req.user!, 'UPSERT_COUPON', 'coupon', code, `Configured coupon ${code}.`);
    res.status(201).json({ ok: true, code });
  }
);

apiRouter.patch(
  '/admin/coupons/:code',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const code = req.params.code.toUpperCase();
    const { active } = req.body as { active: boolean };
    db.prepare('UPDATE coupons SET active = ? WHERE code = ?').run(active ? 1 : 0, code);
    logAdminAction(req.user!, 'TOGGLE_COUPON', 'coupon', code, `Coupon ${code} active=${active}.`);
    res.json({ ok: true });
  }
);

apiRouter.post(
  '/admin/orders/:id/refund',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const orderId = req.params.id;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
      | { id: string; user_id: string; course_id: string; course_title: string; status: string }
      | undefined;
    if (!order) {
      res.status(404).json({ error: 'Order record not found.' });
      return;
    }
    if (order.status === 'Refunded') {
      res.json({ ok: true });
      return;
    }
    db.exec('BEGIN');
    try {
      db.prepare("UPDATE orders SET status = 'Refunded' WHERE id = ?").run(orderId);
      db.prepare("UPDATE enrollments SET status = 'Revoked' WHERE user_id = ? AND course_id = ?").run(
        order.user_id,
        order.course_id
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    logAdminAction(
      req.user!,
      'REFUND_ORDER',
      'order',
      orderId,
      `Refunded order ${orderId} and revoked access to "${order.course_title}".`
    );
    res.json({ ok: true });
  }
);

apiRouter.post(
  '/admin/enrollments',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { userId = '', courseId = '' } = req.body as { userId?: string; courseId?: string };
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId) as
      | { id: string; name: string }
      | undefined;
    const course = db.prepare('SELECT id, title, duration_months FROM courses WHERE id = ?').get(courseId) as
      | { id: string; title: string; duration_months: number }
      | undefined;
    if (!user || !course) {
      res.status(404).json({ error: 'Valid student and course are required.' });
      return;
    }
    const now = new Date();
    const valid = new Date(now);
    valid.setMonth(valid.getMonth() + (course.duration_months || 12));
    const id = `enr-adm-${Date.now()}`;
    db.prepare(
      `INSERT INTO enrollments (id, user_id, course_id, course_title, status, valid_until, progress_percent, enrolled_at)
       VALUES (?, ?, ?, ?, 'Active', ?, 0, ?)`
    ).run(id, user.id, course.id, course.title, valid.toISOString().slice(0, 10), now.toISOString().slice(0, 10));

    logAdminAction(
      req.user!,
      'GRANT_ENROLLMENT',
      'enrollment',
      id,
      `Granted "${course.title}" access to ${user.name} (${user.id}).`
    );
    res.status(201).json({ ok: true, id });
  }
);

apiRouter.post(
  '/admin/notifications/broadcast',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const {
      title = '',
      body = '',
      category = 'Announcement',
      userId = 'ALL',
    } = req.body as {
      title?: string;
      body?: string;
      category?: NotificationItem['category'];
      userId?: string;
    };
    if (!title.trim() || !body.trim()) {
      res.status(400).json({ error: 'Broadcast title and message body are required.' });
      return;
    }
    const id = `ntf-adm-${Date.now()}`;
    db.prepare(
      `INSERT INTO notifications (id, user_id, title, body, category, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 'Just now')`
    ).run(id, userId || 'ALL', title.trim(), body.trim(), category);

    logAdminAction(
      req.user!,
      'BROADCAST_NOTIFICATION',
      'notification',
      id,
      `Sent notification "${title.trim()}" to ${userId || 'ALL'}.`
    );
    res.status(201).json({ ok: true, id });
  }
);

apiRouter.get(
  '/admin/system-health',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const walRow = db.prepare('PRAGMA journal_mode;').get() as { journal_mode?: string };
    const idxRow = db
      .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .get() as { c: number };

    let dbSizeKb = 0;
    try {
      const stat = fs.statSync(DB_PATH);
      dbSizeKb = Math.round(stat.size / 1024);
    } catch {
      dbSizeKb = 0;
    }

    const trackedTables = [
      'users',
      'sessions',
      'chapters',
      'lessons',
      'questions',
      'mock_tests',
      'test_attempts',
      'dpp_sheets',
      'live_classes',
      'courses',
      'orders',
      'enrollments',
      'coupons',
      'community_posts',
      'mentorship_sessions',
      'notifications',
      'scholarships',
      'support_tickets',
      'learning_events',
      'admin_audit_logs',
    ];
    const tableCounts = trackedTables.map((table) => {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
      return { table, rows: row.c };
    });

    const sessionRows = db
      .prepare(
        `SELECT s.token, s.user_id, s.login_method, s.created_at, s.expires_at, u.name, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         ORDER BY s.created_at DESC
         LIMIT 25`
      )
      .all() as Array<{
      token: string;
      user_id: string;
      login_method: LoginMethod;
      created_at: string;
      expires_at: string;
      name: string;
      role: PortalRole;
    }>;

    const eventRows = db
      .prepare(
        `SELECT le.id, le.user_id, le.event_type, le.entity_type, le.entity_id, le.xp_delta, le.created_at, u.name
         FROM learning_events le
         LEFT JOIN users u ON u.id = le.user_id
         ORDER BY le.id DESC
         LIMIT 20`
      )
      .all() as Array<{
      id: number;
      user_id: string;
      user_name?: string;
      name: string | null;
      event_type: string;
      entity_type: string;
      entity_id: string;
      xp_delta: number;
      created_at: string;
    }>;

    const health: SystemHealthMetrics = {
      databaseEngine: 'SQLite WAL (64MB Memory Page Cache + 23 B-Tree Indexes)',
      dbSizeKb,
      walMode: (walRow.journal_mode || '').toLowerCase() === 'wal',
      indexCount: idxRow.c,
      scaleCapacityTarget: '100,000+ Concurrent Student, Faculty & Parent Accounts',
      uptimeSec: Math.round(process.uptime()),
      cacheStats: queryCache.stats(),
      rateLimiterStats: getRateLimiterStats(),
      activeSessionsCount: sessionRows.length,
      activeSessions: sessionRows.map((s) => ({
        tokenPrefix: s.token.slice(0, 12),
        userId: s.user_id,
        userName: s.name,
        userRole: normalizeRole(s.role),
        loginMethod: s.login_method,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        isCurrent: req.sessionToken === s.token,
      })),
      tableCounts,
      recentEvents: eventRows.map((e) => ({
        id: e.id,
        userId: e.user_id,
        userName: e.name || e.user_id,
        eventType: e.event_type,
        entityType: e.entity_type,
        entityId: e.entity_id,
        xpDelta: e.xp_delta,
        createdAt: e.created_at,
      })),
    };

    res.json(health);
  }
);

apiRouter.delete(
  '/admin/sessions/:prefix',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const prefix = req.params.prefix;
    if (req.sessionToken && req.sessionToken.startsWith(prefix)) {
      res.status(400).json({ error: 'Cannot terminate your own active administrator session.' });
      return;
    }
    db.prepare('DELETE FROM sessions WHERE token LIKE ?').run(`${prefix}%`);
    logAdminAction(
      req.user!,
      'REVOKE_SESSION',
      'session',
      prefix,
      `Terminated device session ${prefix}*.`
    );
    res.json({ ok: true });
  }
);

const EXPLORER_TABLES = new Set([
  'users',
  'batches',
  'courses',
  'coupons',
  'orders',
  'enrollments',
  'mock_tests',
  'dpp_sheets',
  'questions',
  'chapters',
  'live_classes',
  'community_posts',
  'mentorship_sessions',
  'notifications',
  'scholarships',
  'support_tickets',
  'admin_audit_logs',
]);

apiRouter.get(
  '/admin/tables/:tableName',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const tableName = req.params.tableName;
    if (!EXPLORER_TABLES.has(tableName)) {
      res.status(400).json({ error: `Table "${tableName}" is not exposed in explorer.` });
      return;
    }
    const rows = db
      .prepare(`SELECT * FROM ${tableName} ORDER BY rowid DESC LIMIT 60`)
      .all() as Array<Record<string, unknown>>;

    // Strip password_hash from users table output
    const safeRows = rows.map((r) => {
      if ('password_hash' in r) {
        const copy = { ...r };
        delete copy.password_hash;
        return copy;
      }
      return r;
    });
    res.json({ table: tableName, rows: safeRows });
  }
);

apiRouter.delete(
  '/admin/tables/:tableName/:id',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const { tableName, id } = req.params;
    if (!EXPLORER_TABLES.has(tableName)) {
      res.status(400).json({ error: `Table "${tableName}" cannot be modified.` });
      return;
    }
    if (tableName === 'users' && id === req.user!.id) {
      res.status(400).json({ error: 'Cannot delete your own administrator account.' });
      return;
    }
    const pkCol = tableName === 'coupons' ? 'code' : 'id';
    db.prepare(`DELETE FROM ${tableName} WHERE ${pkCol} = ?`).run(id);
    logAdminAction(
      req.user!,
      'DELETE_DB_RECORD',
      tableName,
      id,
      `Deleted record ${id} from ${tableName} via Admin DB Explorer.`
    );
    queryCache.clear();
    res.json({ ok: true });
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// 10. LIVE SESSION DETAIL WORKSPACE, SLIDE VIEWER & INTERACTIVE BOARD APIs
// ═════════════════════════════════════════════════════════════════════════════

function buildFallbackBoardState(liveClassId: string, title: string, subject: string): SessionBoardState {
  return {
    liveClassId,
    allowStudentDraw: false,
    activeSlideIndex: 0,
    slides: [
      {
        id: `slide-${liveClassId}-1`,
        title: '1. Main Teaching Board',
        theme: 'blackboard',
        grid: 'grid',
        elements: [
          {
            id: `el-${liveClassId}-hdr`,
            type: 'text',
            authorId: 'system',
            authorName: 'Faculty',
            color: '#F8FAFC',
            strokeWidth: 2,
            x: 48,
            y: 56,
            fontSize: 24,
            text: `${subject}: ${title}`,
          },
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

apiRouter.get(
  '/live-classes/:id/workspace',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const classId = req.params.id;
    const lcRow = db
      .prepare('SELECT * FROM live_classes WHERE id = ?')
      .get(classId) as
      | {
          id: string;
          title: string;
          subject: SubjectName;
          instructor: string;
          instructor_role: string;
          instructor_avatar: string;
          status: 'live' | 'upcoming' | 'recorded';
          scheduled_time: string;
          date_label: string;
          time_range: string;
          grade_label: string;
          language: string;
          track: ExamTrack;
          chapter: string;
          attendees_count: number;
          whiteboard_notes_json: string;
          poll_question_json: string;
        }
      | undefined;

    if (!lcRow) {
      res.status(404).json({ error: 'Live class session not found.' });
      return;
    }

    const liveClass: LiveClassItem = {
      id: lcRow.id,
      title: lcRow.title,
      subject: lcRow.subject,
      instructor: lcRow.instructor,
      instructorRole: lcRow.instructor_role,
      instructorAvatar: lcRow.instructor_avatar,
      status: lcRow.status,
      scheduledTime: lcRow.scheduled_time,
      dateLabel: lcRow.date_label,
      timeRange: lcRow.time_range,
      gradeLabel: lcRow.grade_label,
      language: lcRow.language,
      track: lcRow.track,
      chapter: lcRow.chapter,
      reminded: false,
      attendeesCount: lcRow.attendees_count,
      whiteboardNotes: JSON.parse(lcRow.whiteboard_notes_json || '[]') as string[],
      pollQuestion: JSON.parse(
        lcRow.poll_question_json || '{"prompt":"Quick readiness check","options":[]}'
      ) as LiveClassItem['pollQuestion'],
    };

    let boardRow = db
      .prepare('SELECT * FROM session_boards WHERE live_class_id = ?')
      .get(classId) as
      | {
          live_class_id: string;
          allow_student_draw: number;
          active_slide_index: number;
          slides_json: string;
          updated_at: string;
        }
      | undefined;

    if (!boardRow) {
      const starter = buildFallbackBoardState(classId, liveClass.title, liveClass.subject);
      db.prepare(
        'INSERT OR IGNORE INTO session_boards (live_class_id, allow_student_draw, active_slide_index, slides_json) VALUES (?, 0, 0, ?)'
      ).run(classId, JSON.stringify(starter.slides));
      boardRow = {
        live_class_id: classId,
        allow_student_draw: 0,
        active_slide_index: 0,
        slides_json: JSON.stringify(starter.slides),
        updated_at: starter.updatedAt,
      };
    }

    const board: SessionBoardState = {
      liveClassId: boardRow.live_class_id,
      allowStudentDraw: Boolean(boardRow.allow_student_draw),
      activeSlideIndex: Number(boardRow.active_slide_index) || 0,
      slides: JSON.parse(boardRow.slides_json || '[]'),
      updatedAt: boardRow.updated_at,
    };

    const materialRows = db
      .prepare('SELECT * FROM session_materials WHERE live_class_id = ? ORDER BY rowid ASC')
      .all(classId) as Array<{
      id: string;
      live_class_id: string;
      category: 'note' | 'material';
      title: string;
      file_type: SessionMaterialItem['fileType'];
      pages_json: string;
      created_at: string;
    }>;

    const materials: SessionMaterialItem[] = materialRows.map((m) => ({
      id: m.id,
      liveClassId: m.live_class_id,
      category: m.category,
      title: m.title,
      fileType: m.file_type,
      pages: JSON.parse(m.pages_json || '[]'),
      createdAt: m.created_at,
    }));

    const pollRows = db
      .prepare('SELECT * FROM session_polls WHERE live_class_id = ? ORDER BY rowid DESC')
      .all(classId) as Array<{
      id: string;
      live_class_id: string;
      prompt: string;
      options_json: string;
      status: SessionPollItem['status'];
      created_at: string;
    }>;
    const polls: SessionPollItem[] = pollRows.map((p) => ({
      id: p.id,
      liveClassId: p.live_class_id,
      prompt: p.prompt,
      options: JSON.parse(p.options_json || '[]'),
      status: p.status,
      createdAt: p.created_at,
    }));

    const quizRows = db
      .prepare('SELECT * FROM session_quizzes WHERE live_class_id = ? ORDER BY rowid DESC')
      .all(classId) as Array<{
      id: string;
      live_class_id: string;
      title: string;
      prompt: string;
      options_json: string;
      correct_index: number;
      duration_sec: number;
      status: SessionQuizItem['status'];
      created_at: string;
    }>;
    const quizzes: SessionQuizItem[] = quizRows.map((q) => ({
      id: q.id,
      liveClassId: q.live_class_id,
      title: q.title,
      prompt: q.prompt,
      options: JSON.parse(q.options_json || '["","","",""]'),
      correctIndex: q.correct_index,
      durationSec: q.duration_sec,
      status: q.status,
      createdAt: q.created_at,
    }));

    const classworkRows = db
      .prepare('SELECT * FROM session_classwork WHERE live_class_id = ? ORDER BY rowid DESC')
      .all(classId) as Array<{
      id: string;
      live_class_id: string;
      title: string;
      slide_title: string;
      image_data_url: string;
      saved_by: string;
      created_at: string;
    }>;
    const classwork: SessionClassworkSnapshot[] = classworkRows.map((c) => ({
      id: c.id,
      liveClassId: c.live_class_id,
      title: c.title,
      slideTitle: c.slide_title,
      imageDataUrl: c.image_data_url,
      savedBy: c.saved_by,
      createdAt: c.created_at,
    }));

    const roster = db
      .prepare('SELECT id, name, roll_no AS rollNo, status FROM attendance_roster ORDER BY rowid ASC')
      .all() as unknown as AttendanceStudent[];

    const payload: SessionWorkspacePayload = {
      liveClass,
      objectives:
        liveClass.whiteboardNotes.length > 0
          ? liveClass.whiteboardNotes
          : [`Student will learn about ${liveClass.chapter}`],
      about: {
        exam: liveClass.id === 'live-5' ? 'CBSE Grade 8' : liveClass.track,
        chapter:
          liveClass.id === 'live-5'
            ? 'How Nature Works in Harmony.-CBSE Grade 8-Biology-(Grade 8)'
            : `${liveClass.chapter} · ${liveClass.subject} (${liveClass.gradeLabel})`,
        topic: liveClass.id === 'live-5' ? 'Who Eats Whom?' : liveClass.title,
        subTopic: liveClass.id === 'live-5' ? 'Food Web' : 'Core Derivations & PYQs',
        program:
          liveClass.id === 'live-5'
            ? 'CBSE Grade 8 All Subjects Infinity One'
            : `${liveClass.track} 2027 Ramu School Comprehensive`,
        batch:
          liveClass.id === 'live-5'
            ? 'M-8-235 || 4-8 1:1 || WedFri || 7 PM - 8 PM || Aug || English'
            : `RS-${liveClass.subject.slice(0, 3).toUpperCase()}-27 || ${liveClass.timeRange} || ${liveClass.language}`,
        durationMin: 55,
      },
      materials,
      polls,
      quizzes,
      classwork,
      board,
      roster,
    };

    res.json(payload);
  }
);

apiRouter.put(
  '/live-classes/:id/board',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const classId = req.params.id;
    const isEducator = req.user!.role === 'teacher' || req.user!.role === 'admin';
    const currentRow = db
      .prepare('SELECT allow_student_draw FROM session_boards WHERE live_class_id = ?')
      .get(classId) as { allow_student_draw: number } | undefined;

    if (!isEducator && !currentRow?.allow_student_draw) {
      res.status(403).json({ error: 'Student board drawing is currently locked by faculty.' });
      return;
    }

    const body = req.body as Partial<SessionBoardState>;
    if (!Array.isArray(body.slides)) {
      res.status(400).json({ error: 'slides array is required.' });
      return;
    }

    const allowStudentDraw = isEducator
      ? Boolean(body.allowStudentDraw)
      : Boolean(currentRow?.allow_student_draw);
    const activeSlideIndex = Math.max(
      0,
      Math.min(Number(body.activeSlideIndex) || 0, Math.max(0, body.slides.length - 1))
    );

    db.prepare(
      `INSERT INTO session_boards (live_class_id, allow_student_draw, active_slide_index, slides_json, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(live_class_id) DO UPDATE SET
         allow_student_draw = excluded.allow_student_draw,
         active_slide_index = excluded.active_slide_index,
         slides_json = excluded.slides_json,
         updated_at = datetime('now')`
    ).run(classId, allowStudentDraw ? 1 : 0, activeSlideIndex, JSON.stringify(body.slides));

    const updated: SessionBoardState = {
      liveClassId: classId,
      allowStudentDraw,
      activeSlideIndex,
      slides: body.slides,
      updatedAt: new Date().toISOString(),
    };
    broadcastClassroomEvent(classId, 'board:init', updated);
    res.json({ ok: true, board: updated });
  }
);

apiRouter.post(
  '/live-classes/:id/materials',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const classId = req.params.id;
    const {
      category = 'material',
      title = '',
      fileType = 'PDF',
      summary = '',
      keyFormula = '',
    } = req.body as {
      category?: 'note' | 'material';
      title?: string;
      fileType?: SessionMaterialItem['fileType'];
      summary?: string;
      keyFormula?: string;
    };

    if (!title.trim()) {
      res.status(400).json({ error: 'Material title is required.' });
      return;
    }

    const id = `mat-${Date.now()}`;
    const pages = [
      {
        pageNo: 1,
        heading: title.trim(),
        subheading: `Uploaded by ${req.user!.name} · Ramu School`,
        bodyBullets: summary.trim()
          ? summary
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
          : ['Faculty-curated class handout & annotated teaching slide deck.'],
        keyFormula: keyFormula.trim() || undefined,
      },
    ];

    db.prepare(
      `INSERT INTO session_materials (id, live_class_id, category, title, file_type, pages_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, classId, category, title.trim(), fileType, JSON.stringify(pages));

    const item: SessionMaterialItem = {
      id,
      liveClassId: classId,
      category,
      title: title.trim(),
      fileType,
      pages,
      createdAt: new Date().toISOString(),
    };
    broadcastClassroomEvent(classId, 'material:new', item);
    res.status(201).json({ material: item });
  }
);

apiRouter.post(
  '/live-classes/:id/polls',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const classId = req.params.id;
    const { prompt = '', options = [] } = req.body as {
      prompt?: string;
      options?: string[];
    };
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (!prompt.trim() || cleanOpts.length < 2) {
      res.status(400).json({ error: 'Poll prompt and at least 2 options are required.' });
      return;
    }

    const id = `poll-${Date.now()}`;
    const pollOptions = cleanOpts.map((label, idx) => ({
      id: String.fromCharCode(97 + idx),
      label,
      votes: 0,
    }));

    db.prepare(
      `INSERT INTO session_polls (id, live_class_id, prompt, options_json, status)
       VALUES (?, ?, ?, ?, 'Live')`
    ).run(id, classId, prompt.trim(), JSON.stringify(pollOptions));

    const poll: SessionPollItem = {
      id,
      liveClassId: classId,
      prompt: prompt.trim(),
      options: pollOptions,
      status: 'Live',
      createdAt: new Date().toISOString(),
    };
    broadcastClassroomEvent(classId, 'poll:new', poll);
    res.status(201).json({ poll });
  }
);

apiRouter.post(
  '/live-classes/:id/polls/:pollId/vote',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const { id: classId, pollId } = req.params;
    const { optionId = '' } = req.body as { optionId?: string };
    const row = db
      .prepare('SELECT * FROM session_polls WHERE id = ? AND live_class_id = ?')
      .get(pollId, classId) as
      | { id: string; prompt: string; options_json: string; status: SessionPollItem['status']; created_at: string }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Poll not found.' });
      return;
    }

    const opts = JSON.parse(row.options_json || '[]') as Array<{
      id: string;
      label: string;
      votes: number;
    }>;
    const updated = opts.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o));
    db.prepare('UPDATE session_polls SET options_json = ? WHERE id = ?').run(
      JSON.stringify(updated),
      pollId
    );
    const poll: SessionPollItem = {
      id: row.id,
      liveClassId: classId,
      prompt: row.prompt,
      options: updated,
      status: row.status,
      createdAt: row.created_at,
    };
    broadcastClassroomEvent(classId, 'poll:updated', poll);
    res.json({ poll });
  }
);

apiRouter.post(
  '/live-classes/:id/quizzes',
  requireAuth,
  requireTeacher,
  (req: AuthenticatedRequest, res: Response) => {
    const classId = req.params.id;
    const {
      title = 'Quick Concept Quiz',
      prompt = '',
      options = ['', '', '', ''],
      correctIndex = 0,
      durationSec = 60,
    } = req.body as {
      title?: string;
      prompt?: string;
      options?: [string, string, string, string];
      correctIndex?: number;
      durationSec?: number;
    };

    if (!prompt.trim() || options.some((o) => !String(o).trim())) {
      res.status(400).json({ error: 'Quiz question prompt and all 4 options are required.' });
      return;
    }

    const id = `quiz-${Date.now()}`;
    const cleanOptions = options.map((o) => String(o).trim()) as [string, string, string, string];
    db.prepare(
      `INSERT INTO session_quizzes (id, live_class_id, title, prompt, options_json, correct_index, duration_sec, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Live')`
    ).run(
      id,
      classId,
      title.trim() || 'Live Pop Quiz',
      prompt.trim(),
      JSON.stringify(cleanOptions),
      Math.max(0, Math.min(3, Number(correctIndex) || 0)),
      Math.max(15, Number(durationSec) || 60)
    );

    const quiz: SessionQuizItem = {
      id,
      liveClassId: classId,
      title: title.trim() || 'Live Pop Quiz',
      prompt: prompt.trim(),
      options: cleanOptions,
      correctIndex: Math.max(0, Math.min(3, Number(correctIndex) || 0)),
      durationSec: Math.max(15, Number(durationSec) || 60),
      status: 'Live',
      createdAt: new Date().toISOString(),
    };
    broadcastClassroomEvent(classId, 'quiz:new', quiz);
    res.status(201).json({ quiz });
  }
);

apiRouter.post(
  '/live-classes/:id/classwork',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const classId = req.params.id;
    const { title = 'Board Snapshot', slideTitle = 'Slide 1', imageDataUrl = '' } = req.body as {
      title?: string;
      slideTitle?: string;
      imageDataUrl?: string;
    };
    if (!imageDataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Valid PNG/JPEG data URL is required.' });
      return;
    }
    const id = `cw-${Date.now()}`;
    db.prepare(
      `INSERT INTO session_classwork (id, live_class_id, title, slide_title, image_data_url, saved_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, classId, title.trim(), slideTitle.trim(), imageDataUrl, req.user!.name);

    const snapshot: SessionClassworkSnapshot = {
      id,
      liveClassId: classId,
      title: title.trim(),
      slideTitle: slideTitle.trim(),
      imageDataUrl,
      savedBy: req.user!.name,
      createdAt: new Date().toISOString(),
    };
    broadcastClassroomEvent(classId, 'classwork:new', snapshot);
    res.status(201).json({ classwork: snapshot });
  }
);




