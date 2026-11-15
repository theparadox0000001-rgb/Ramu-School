import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  BATCH_LEADERBOARD,
  INITIAL_ATTENDANCE_ROSTER,
  INITIAL_CHAPTERS,
  INITIAL_DPP_SHEETS,
  INITIAL_FLASHCARDS,
  INITIAL_LIVE_CLASSES,
  INITIAL_STUDY_TASKS,
  INITIAL_TEACHER_ASSIGNMENTS,
  INITIAL_TEST_HISTORY,
  MOCK_TESTS,
  NCERT_SOLUTIONS,
  QUESTION_BANK,
  SEED_BATCHES,
  SEED_COMMUNITY_POSTS,
  SEED_COMMUNITY_REPLIES,
  SEED_COUPONS,
  SEED_COURSES,
  SEED_ENROLLMENTS,
  SEED_ERROR_LOG_IDS,
  SEED_EXTRA_ATTEMPTS,
  SEED_GAMIFICATION,
  SEED_MENTORSHIP_SESSIONS,
  SEED_NOTIFICATIONS,
  SEED_ORDERS,
  SEED_PARENT_LINKS,
  SEED_PLATFORM_CONFIG,
  SEED_SCHOLARSHIPS,
  SEED_TICKETS,
  SEED_USERS,
} from './seedData.ts';
import { configureHighScaleSqlite, ensureProductionIndexes } from './infra.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'infinity_learn.db');
export const db = new DatabaseSync(DB_PATH);

// High-concurrency SQLite tuning (WAL, 64MB page cache, busy_timeout) for 1L+ scale
configureHighScaleSqlite(db);

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derivedBuf.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, keyBuf);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin', 'parent')),
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      admission_id TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      dob_pin TEXT NOT NULL DEFAULT '2009-05-14',
      track TEXT NOT NULL,
      program_name TEXT NOT NULL,
      grade TEXT NOT NULL,
      daily_goal_hours INTEGER NOT NULL DEFAULT 4,
      streak_days INTEGER NOT NULL DEFAULT 1,
      weekly_hours_logged REAL NOT NULL DEFAULT 0,
      avatar_url TEXT NOT NULL,
      login_method TEXT NOT NULL DEFAULT 'otp',
      batch_id TEXT,
      campus TEXT NOT NULL DEFAULT 'Online National Live Cohort',
      subjects_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      login_method TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      role TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      title TEXT NOT NULL,
      unit TEXT NOT NULL,
      weightage TEXT NOT NULL,
      mastery_percent INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('video', 'notes', 'practice')),
      instructor TEXT NOT NULL,
      summary TEXT NOT NULL,
      key_formulas_json TEXT NOT NULL,
      timestamps_json TEXT NOT NULL,
      notes_content TEXT NOT NULL,
      default_completed INTEGER NOT NULL DEFAULT 0,
      default_bookmarked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_lesson_progress (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      completed INTEGER NOT NULL DEFAULT 0,
      bookmarked INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS live_classes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      instructor TEXT NOT NULL,
      instructor_role TEXT NOT NULL,
      instructor_avatar TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('live', 'upcoming', 'recorded')),
      scheduled_time TEXT NOT NULL,
      date_label TEXT NOT NULL,
      time_range TEXT NOT NULL,
      grade_label TEXT NOT NULL,
      language TEXT NOT NULL,
      track TEXT NOT NULL,
      chapter TEXT NOT NULL,
      attendees_count INTEGER NOT NULL DEFAULT 0,
      whiteboard_notes_json TEXT NOT NULL,
      poll_question_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_live_reminders (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      live_class_id TEXT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
      reminded INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, live_class_id)
    );

    CREATE TABLE IF NOT EXISTS live_class_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      live_class_id TEXT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS live_class_poll_votes (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      live_class_id TEXT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
      option_id TEXT NOT NULL,
      PRIMARY KEY (user_id, live_class_id)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK (difficulty IN ('Foundation', 'Moderate', 'Advanced')),
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      explanation TEXT NOT NULL,
      formula_used TEXT NOT NULL,
      avg_time_sec INTEGER NOT NULL DEFAULT 45
    );

    CREATE TABLE IF NOT EXISTS mock_tests (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      subjects_json TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      total_marks INTEGER NOT NULL,
      negative_marking INTEGER NOT NULL DEFAULT 1,
      difficulty TEXT NOT NULL,
      question_ids_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      test_title TEXT NOT NULL,
      category TEXT NOT NULL,
      date_label TEXT NOT NULL,
      score INTEGER NOT NULL,
      max_score INTEGER NOT NULL,
      accuracy_percent INTEGER NOT NULL,
      time_spent_min INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      incorrect_count INTEGER NOT NULL,
      unattempted_count INTEGER NOT NULL,
      subject_breakdown_json TEXT NOT NULL,
      responses_json TEXT,
      question_ids_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_error_log (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS dpp_sheets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      date_label TEXT NOT NULL,
      estimated_min INTEGER NOT NULL,
      question_ids_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_dpp_progress (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dpp_id TEXT NOT NULL REFERENCES dpp_sheets(id) ON DELETE CASCADE,
      completed INTEGER NOT NULL DEFAULT 0,
      answers_json TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, dpp_id)
    );

    CREATE TABLE IF NOT EXISTS ncert_solutions (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL,
      exercise_ref TEXT NOT NULL,
      question TEXT NOT NULL,
      solution_steps_json TEXT NOT NULL,
      final_answer TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL,
      front TEXT NOT NULL,
      hint TEXT NOT NULL,
      back TEXT NOT NULL,
      formula TEXT NOT NULL,
      default_status TEXT NOT NULL DEFAULT 'new',
      default_bookmarked INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_flashcard_progress (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      flashcard_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'new',
      bookmarked INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, flashcard_id)
    );

    CREATE TABLE IF NOT EXISTS study_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      day TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saved_doubts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      grade_label TEXT NOT NULL,
      due_date TEXT NOT NULL,
      submitted_count INTEGER NOT NULL DEFAULT 0,
      total_students INTEGER NOT NULL DEFAULT 28,
      status TEXT NOT NULL CHECK (status IN ('Active', 'Graded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_roster (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Present', 'Late', 'Absent'))
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leaderboard_entries (
      rank INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      track TEXT NOT NULL,
      tests_taken INTEGER NOT NULL,
      accuracy_percent INTEGER NOT NULL,
      score_points INTEGER NOT NULL,
      user_id TEXT
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      track TEXT NOT NULL,
      campus TEXT NOT NULL,
      lead_faculty TEXT NOT NULL,
      student_count INTEGER NOT NULL DEFAULT 0,
      capacity INTEGER NOT NULL DEFAULT 60,
      schedule_slot TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Active', 'Upcoming', 'Archived')) DEFAULT 'Active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      institution_name TEXT NOT NULL DEFAULT 'Ramu School',
      tagline TEXT NOT NULL DEFAULT 'National EdTech & Competitive Exam Operating System',
      maintenance_mode INTEGER NOT NULL DEFAULT 0,
      allow_public_signup INTEGER NOT NULL DEFAULT 1,
      ai_mentor_enabled INTEGER NOT NULL DEFAULT 1,
      marketplace_enabled INTEGER NOT NULL DEFAULT 1,
      community_enabled INTEGER NOT NULL DEFAULT 1,
      parent_portal_enabled INTEGER NOT NULL DEFAULT 1,
      scholarship_open INTEGER NOT NULL DEFAULT 1,
      max_sessions_per_user INTEGER NOT NULL DEFAULT 5,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parent_student_links (
      parent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL DEFAULT 'Parent',
      PRIMARY KEY (parent_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      track TEXT NOT NULL,
      subject_focus TEXT NOT NULL,
      instructor TEXT NOT NULL,
      price_inr INTEGER NOT NULL,
      mrp_inr INTEGER NOT NULL,
      duration_months INTEGER NOT NULL DEFAULT 12,
      rating REAL NOT NULL DEFAULT 4.8,
      reviews_count INTEGER NOT NULL DEFAULT 120,
      enrolled_count INTEGER NOT NULL DEFAULT 0,
      badge TEXT NOT NULL DEFAULT 'Popular',
      syllabus_highlights_json TEXT NOT NULL DEFAULT '[]',
      is_featured INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('Published', 'Draft', 'Archived')) DEFAULT 'Published',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      discount_percent INTEGER NOT NULL,
      max_discount_inr INTEGER NOT NULL,
      min_order_inr INTEGER NOT NULL DEFAULT 0,
      usage_limit INTEGER NOT NULL DEFAULT 500,
      used_count INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      course_title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Active', 'Expired', 'Revoked')) DEFAULT 'Active',
      valid_until TEXT NOT NULL,
      progress_percent INTEGER NOT NULL DEFAULT 0,
      enrolled_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL,
      course_title TEXT NOT NULL,
      amount_paid_inr INTEGER NOT NULL,
      discount_inr INTEGER NOT NULL DEFAULT 0,
      coupon_code TEXT,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Paid', 'Refunded', 'Failed')) DEFAULT 'Paid',
      invoice_no TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      upvotes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('Open', 'Resolved', 'Escalated')) DEFAULT 'Open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS community_replies (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      body TEXT NOT NULL,
      is_accepted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mentorship_sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_name TEXT NOT NULL,
      mentor_name TEXT NOT NULL,
      mentor_role TEXT NOT NULL,
      topic TEXT NOT NULL,
      scheduled_slot TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Scheduled', 'Completed', 'Cancelled')) DEFAULT 'Scheduled',
      action_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scholarships (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      code TEXT NOT NULL,
      track TEXT NOT NULL,
      exam_date_label TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      max_scholarship_percent INTEGER NOT NULL,
      prize_pool TEXT NOT NULL,
      registered_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('Open', 'Upcoming', 'Closed')) DEFAULT 'Open'
    );

    CREATE TABLE IF NOT EXISTS scholarship_registrations (
      scholarship_id TEXT NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admit_card_code TEXT NOT NULL,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (scholarship_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS learning_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      xp_delta INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_gamification (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      xp_points INTEGER NOT NULL DEFAULT 350,
      level INTEGER NOT NULL DEFAULT 1,
      badges_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_boards (
      live_class_id TEXT PRIMARY KEY REFERENCES live_classes(id) ON DELETE CASCADE,
      allow_student_draw INTEGER NOT NULL DEFAULT 0,
      active_slide_index INTEGER NOT NULL DEFAULT 0,
      slides_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_materials (
      id TEXT PRIMARY KEY,
      live_class_id TEXT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK (category IN ('note', 'material')),
      title TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'PDF',
      pages_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_polls (
      id TEXT PRIMARY KEY,
      live_class_id TEXT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Live',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_quizzes (
      id TEXT PRIMARY KEY,
      live_class_id TEXT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_index INTEGER NOT NULL DEFAULT 0,
      duration_sec INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'Live',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_classwork (
      id TEXT PRIMARY KEY,
      live_class_id TEXT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slide_title TEXT NOT NULL,
      image_data_url TEXT NOT NULL,
      saved_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_session_materials_class ON session_materials(live_class_id);
    CREATE INDEX IF NOT EXISTS idx_session_polls_class ON session_polls(live_class_id);
    CREATE INDEX IF NOT EXISTS idx_session_quizzes_class ON session_quizzes(live_class_id);
    CREATE INDEX IF NOT EXISTS idx_session_classwork_class ON session_classwork(live_class_id);
  `);

  migrateUsersRoleConstraintIfNeeded();
  ensureUserColumns();
  seedInitialDataIfEmpty();
  ensureAdminAndBatchSeeds();
  ensureExtendedPlatformSeeds();
  ensureLiveSessionWorkspaces();
  ensureProductionIndexes(db);
}

function migrateUsersRoleConstraintIfNeeded(): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { sql?: string } | undefined;
  if (!row?.sql || row.sql.includes("'parent'")) return;

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN;');
  try {
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin', 'parent')),
        name TEXT NOT NULL,
        initials TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT UNIQUE,
        admission_id TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        dob_pin TEXT NOT NULL DEFAULT '2009-05-14',
        track TEXT NOT NULL,
        program_name TEXT NOT NULL,
        grade TEXT NOT NULL,
        daily_goal_hours INTEGER NOT NULL DEFAULT 4,
        streak_days INTEGER NOT NULL DEFAULT 1,
        weekly_hours_logged REAL NOT NULL DEFAULT 0,
        avatar_url TEXT NOT NULL,
        login_method TEXT NOT NULL DEFAULT 'otp',
        batch_id TEXT,
        campus TEXT NOT NULL DEFAULT 'Online National Live Cohort',
        subjects_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (
        id, role, name, initials, email, phone, admission_id, password_hash, dob_pin,
        track, program_name, grade, daily_goal_hours, streak_days, weekly_hours_logged,
        avatar_url, login_method, batch_id, campus, subjects_json, created_at
      )
      SELECT
        id, role, name, initials, email, phone, admission_id, password_hash, dob_pin,
        track, program_name, grade, daily_goal_hours, streak_days, weekly_hours_logged,
        avatar_url, login_method, batch_id, campus, subjects_json, created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function ensureUserColumns(): void {
  const cols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has('batch_id')) {
    db.exec('ALTER TABLE users ADD COLUMN batch_id TEXT;');
  }
  if (!colNames.has('campus')) {
    db.exec("ALTER TABLE users ADD COLUMN campus TEXT NOT NULL DEFAULT 'Online National Live Cohort';");
  }
  if (!colNames.has('subjects_json')) {
    db.exec("ALTER TABLE users ADD COLUMN subjects_json TEXT NOT NULL DEFAULT '[]';");
  }
}

function ensureAdminAndBatchSeeds(): void {
  const insertUserIgnore = db.prepare(`
    INSERT OR IGNORE INTO users (
      id, role, name, initials, email, phone, admission_id, password_hash, dob_pin,
      track, program_name, grade, daily_goal_hours, streak_days, weekly_hours_logged,
      avatar_url, login_method, batch_id, campus, subjects_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const backfillUserMeta = db.prepare(`
    UPDATE users
    SET batch_id = COALESCE(batch_id, ?),
        campus = CASE WHEN campus IS NULL OR campus = '' OR campus = 'Online National Live Cohort' THEN ? ELSE campus END,
        subjects_json = CASE WHEN subjects_json IS NULL OR subjects_json = '[]' THEN ? ELSE subjects_json END
    WHERE id = ?
  `);

  for (const u of SEED_USERS) {
    const subjectsJson = JSON.stringify(u.subjects || []);
    insertUserIgnore.run(
      u.id,
      u.role,
      u.name,
      u.initials,
      u.email,
      u.phone,
      u.admissionId,
      hashPassword(u.defaultPassword),
      u.dobPin,
      u.track,
      u.programName,
      u.grade,
      u.dailyGoalHours,
      u.streakDays,
      u.weeklyHoursLogged,
      u.avatarUrl,
      u.loginMethod,
      u.batchId || null,
      u.campus || 'Online National Live Cohort',
      subjectsJson
    );
    backfillUserMeta.run(
      u.batchId || null,
      u.campus || 'Online National Live Cohort',
      subjectsJson,
      u.id
    );
  }

  const batchCount = db.prepare('SELECT COUNT(*) AS cnt FROM batches').get() as { cnt: number };
  if (batchCount.cnt === 0) {
    const insertBatch = db.prepare(`
      INSERT OR IGNORE INTO batches (
        id, code, name, track, campus, lead_faculty, student_count, capacity, schedule_slot, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of SEED_BATCHES) {
      insertBatch.run(
        b.id,
        b.code,
        b.name,
        b.track,
        b.campus,
        b.leadFaculty,
        b.studentCount,
        b.capacity,
        b.scheduleSlot,
        b.status
      );
    }
  }

  // Seed multi-student test attempts (with full responses_json for admin Answer Sheet drill-down)
  const insertExtraAttempt = db.prepare(`
    INSERT OR IGNORE INTO test_attempts (
      id, user_id, test_title, category, date_label, score, max_score, accuracy_percent,
      time_spent_min, correct_count, incorrect_count, unattempted_count, subject_breakdown_json,
      responses_json, question_ids_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const att of SEED_EXTRA_ATTEMPTS) {
    insertExtraAttempt.run(
      att.id,
      att.userId,
      att.testTitle,
      att.category,
      att.dateLabel,
      att.score,
      att.maxScore,
      att.accuracyPercent,
      att.timeSpentMin,
      att.correctCount,
      att.incorrectCount,
      att.unattemptedCount,
      JSON.stringify(att.subjectBreakdown),
      JSON.stringify(att.responses),
      JSON.stringify(att.questionIds)
    );
  }

  // Backfill sample questionIds & responses on INITIAL_TEST_HISTORY rows if missing
  db.prepare(`
    UPDATE test_attempts
    SET question_ids_json = COALESCE(question_ids_json, '["q-phy-1","q-phy-2","q-chem-1","q-chem-2","q-math-1","q-math-2"]'),
        responses_json = COALESCE(responses_json, '{"q-phy-1":1,"q-phy-2":0,"q-chem-1":2,"q-chem-2":1,"q-math-1":1,"q-math-2":0}')
    WHERE user_id = ? AND question_ids_json IS NULL
  `).run(SEED_USERS[0].id);

  // Seed initial support tickets if empty
  const ticketCount = db
    .prepare('SELECT COUNT(*) AS cnt FROM support_tickets')
    .get() as { cnt: number };
  if (ticketCount.cnt === 0) {
    const insertTicket = db.prepare(`
      INSERT OR IGNORE INTO support_tickets (id, user_id, category, subject, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of SEED_TICKETS) {
      insertTicket.run(t.id, t.userId, t.category, t.subject, t.message, t.status, t.createdAt);
    }
  }

  const auditCount = db
    .prepare('SELECT COUNT(*) AS cnt FROM admin_audit_logs')
    .get() as { cnt: number };
  if (auditCount.cnt === 0) {
    const insertAudit = db.prepare(`
      INSERT INTO admin_audit_logs (actor_name, actor_role, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertAudit.run(
      'Raghavendra Rao',
      'admin',
      'INITIALIZE_COHORTS',
      'batch',
      'SC-HYD-JEE-27A',
      'Provisioned 4 Sri Chaitanya & National Online Academic Batches in SQLite.'
    );
    insertAudit.run(
      'Raghavendra Rao',
      'admin',
      'SYNC_ASSESSMENTS',
      'mock_test',
      'AITS-2027',
      'Published All India Test Series templates and mapped NCERT/CYOT Question Bank.'
    );
  }
}

function ensureExtendedPlatformSeeds(): void {
  const cfgCount = db.prepare('SELECT COUNT(*) AS cnt FROM platform_config').get() as { cnt: number };
  if (cfgCount.cnt === 0) {
    db.prepare(
      `INSERT INTO platform_config (
        id, institution_name, tagline, maintenance_mode, allow_public_signup,
        ai_mentor_enabled, marketplace_enabled, community_enabled, parent_portal_enabled,
        scholarship_open, max_sessions_per_user
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      SEED_PLATFORM_CONFIG.institutionName,
      SEED_PLATFORM_CONFIG.tagline,
      SEED_PLATFORM_CONFIG.maintenanceMode ? 1 : 0,
      SEED_PLATFORM_CONFIG.allowPublicSignup ? 1 : 0,
      SEED_PLATFORM_CONFIG.aiMentorEnabled ? 1 : 0,
      SEED_PLATFORM_CONFIG.marketplaceEnabled ? 1 : 0,
      SEED_PLATFORM_CONFIG.communityEnabled ? 1 : 0,
      SEED_PLATFORM_CONFIG.parentPortalEnabled ? 1 : 0,
      SEED_PLATFORM_CONFIG.scholarshipOpen ? 1 : 0,
      SEED_PLATFORM_CONFIG.maxSessionsPerUser
    );
  }

  const insertParentLink = db.prepare(
    'INSERT OR IGNORE INTO parent_student_links (parent_id, student_id, relationship) VALUES (?, ?, ?)'
  );
  for (const link of SEED_PARENT_LINKS) {
    insertParentLink.run(link.parentId, link.studentId, link.relationship);
  }

  const courseCount = db.prepare('SELECT COUNT(*) AS cnt FROM courses').get() as { cnt: number };
  if (courseCount.cnt === 0) {
    const insCourse = db.prepare(
      `INSERT OR IGNORE INTO courses (
        id, title, subtitle, track, subject_focus, instructor, price_inr, mrp_inr,
        duration_months, rating, reviews_count, enrolled_count, badge, syllabus_highlights_json,
        is_featured, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of SEED_COURSES) {
      insCourse.run(
        c.id,
        c.title,
        c.subtitle,
        c.track,
        c.subjectFocus,
        c.instructor,
        c.priceInr,
        c.mrpInr,
        c.durationMonths,
        c.rating,
        c.reviewsCount,
        c.enrolledCount,
        c.badge,
        JSON.stringify(c.syllabusHighlights),
        c.isFeatured ? 1 : 0,
        c.status
      );
    }
  }

  const couponCount = db.prepare('SELECT COUNT(*) AS cnt FROM coupons').get() as { cnt: number };
  if (couponCount.cnt === 0) {
    const insCoupon = db.prepare(
      `INSERT OR IGNORE INTO coupons (
        code, discount_percent, max_discount_inr, min_order_inr, usage_limit, used_count, active, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const cp of SEED_COUPONS) {
      insCoupon.run(
        cp.code,
        cp.discountPercent,
        cp.maxDiscountInr,
        cp.minOrderInr,
        cp.usageLimit,
        cp.usedCount,
        cp.active ? 1 : 0,
        cp.expiresAt
      );
    }
  }

  const enrollmentCount = db.prepare('SELECT COUNT(*) AS cnt FROM enrollments').get() as { cnt: number };
  if (enrollmentCount.cnt === 0) {
    const insEnr = db.prepare(
      `INSERT OR IGNORE INTO enrollments (
        id, user_id, course_id, course_title, status, valid_until, progress_percent, enrolled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const e of SEED_ENROLLMENTS) {
      insEnr.run(
        e.id,
        e.userId,
        e.courseId,
        e.courseTitle,
        e.status,
        e.validUntil,
        e.progressPercent,
        e.enrolledAt
      );
    }
  }

  const orderCount = db.prepare('SELECT COUNT(*) AS cnt FROM orders').get() as { cnt: number };
  if (orderCount.cnt === 0) {
    const insOrd = db.prepare(
      `INSERT OR IGNORE INTO orders (
        id, user_id, course_id, course_title, amount_paid_inr, discount_inr, coupon_code,
        payment_method, status, invoice_no, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const o of SEED_ORDERS) {
      insOrd.run(
        o.id,
        o.userId,
        o.courseId,
        o.courseTitle,
        o.amountPaidInr,
        o.discountInr,
        o.couponCode,
        o.paymentMethod,
        o.status,
        o.invoiceNo,
        o.createdAt
      );
    }
  }

  const notifCount = db.prepare('SELECT COUNT(*) AS cnt FROM notifications').get() as { cnt: number };
  if (notifCount.cnt === 0) {
    const insNotif = db.prepare(
      `INSERT OR IGNORE INTO notifications (id, user_id, title, body, category, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const n of SEED_NOTIFICATIONS) {
      insNotif.run(n.id, n.userId, n.title, n.body, n.category, n.isRead ? 1 : 0, n.createdAt);
    }
  }

  const postCount = db.prepare('SELECT COUNT(*) AS cnt FROM community_posts').get() as { cnt: number };
  if (postCount.cnt === 0) {
    const insPost = db.prepare(
      `INSERT OR IGNORE INTO community_posts (
        id, author_id, author_name, author_role, subject, chapter_title, title, body, upvotes, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of SEED_COMMUNITY_POSTS) {
      insPost.run(
        p.id,
        p.authorId,
        p.authorName,
        p.authorRole,
        p.subject,
        p.chapterTitle,
        p.title,
        p.body,
        p.upvotes,
        p.status,
        p.createdAt
      );
    }

    const insReply = db.prepare(
      `INSERT OR IGNORE INTO community_replies (
        id, post_id, author_id, author_name, author_role, body, is_accepted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of SEED_COMMUNITY_REPLIES) {
      insReply.run(
        r.id,
        r.postId,
        r.authorId,
        r.authorName,
        r.authorRole,
        r.body,
        r.isAccepted ? 1 : 0,
        r.createdAt
      );
    }
  }

  const mntCount = db.prepare('SELECT COUNT(*) AS cnt FROM mentorship_sessions').get() as { cnt: number };
  if (mntCount.cnt === 0) {
    const insMnt = db.prepare(
      `INSERT OR IGNORE INTO mentorship_sessions (
        id, student_id, student_name, mentor_name, mentor_role, topic, scheduled_slot, status, action_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const m of SEED_MENTORSHIP_SESSIONS) {
      insMnt.run(
        m.id,
        m.studentId,
        m.studentName,
        m.mentorName,
        m.mentorRole,
        m.topic,
        m.scheduledSlot,
        m.status,
        m.actionNotes,
        m.createdAt
      );
    }
  }

  const schCount = db.prepare('SELECT COUNT(*) AS cnt FROM scholarships').get() as { cnt: number };
  if (schCount.cnt === 0) {
    const insSch = db.prepare(
      `INSERT OR IGNORE INTO scholarships (
        id, title, code, track, exam_date_label, duration_min, max_scholarship_percent,
        prize_pool, registered_count, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of SEED_SCHOLARSHIPS) {
      insSch.run(
        s.id,
        s.title,
        s.code,
        s.track,
        s.examDateLabel,
        s.durationMin,
        s.maxScholarshipPercent,
        s.prizePool,
        s.registeredCount,
        s.status
      );
    }
  }

  const insGam = db.prepare(
    'INSERT OR IGNORE INTO user_gamification (user_id, xp_points, level, badges_json) VALUES (?, ?, ?, ?)'
  );
  for (const g of SEED_GAMIFICATION) {
    insGam.run(g.userId, g.xpPoints, g.level, JSON.stringify(g.badges));
  }

  const evtCount = db.prepare('SELECT COUNT(*) AS cnt FROM learning_events').get() as { cnt: number };
  if (evtCount.cnt === 0) {
    const insEvt = db.prepare(
      `INSERT INTO learning_events (user_id, event_type, entity_type, entity_id, xp_delta, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insEvt.run('IL-2027-88412', 'LESSON_COMPLETED', 'lesson', 'les-phy-1', 25, '{"subject":"Physics"}');
    insEvt.run('IL-2027-88412', 'TEST_SUBMITTED', 'test_attempt', 'att-1', 60, '{"accuracy":75}');
    insEvt.run('IL-STU-4420', 'COURSE_ENROLLED', 'course', 'crs-jee-apex-27', 50, '{}');
    insEvt.run('IL-STU-4421', 'DPP_COMPLETED', 'dpp', 'dpp-3', 30, '{"subject":"Biology"}');
  }
}

function ensureLiveSessionWorkspaces(): void {
  // Ensure the Grade 8 Biology session matching the reference PDFs exists
  db.prepare(
    `INSERT OR IGNORE INTO live_classes (
      id, title, subject, instructor, instructor_role, instructor_avatar, status,
      scheduled_time, date_label, time_range, grade_label, language, track, chapter,
      attendees_count, whiteboard_notes_json, poll_question_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'live-5',
    'How Nature Works in Harmony - 1',
    'Biology',
    'Ekansh Mishra',
    'Faculty Mentor · Ramu School',
    '/src/assets/images/mentor_chemistry_1794761563628.jpg',
    'live',
    '18 Nov, 2026 · 8:00 pm – 8:55 pm',
    '18 Nov, 2026',
    '8:00 pm – 8:55 pm',
    'Grade 8',
    'ENGLISH',
    'CBSE Grade 10',
    'How Nature Works in Harmony',
    18,
    JSON.stringify([
      'Producers (autotrophs) capture solar energy via photosynthesis.',
      'Primary, Secondary & Tertiary Consumers form interconnected Food Webs.',
      'Decomposers recycle nutrients back to soil keeping ecosystems balanced.',
    ]),
    JSON.stringify({
      prompt: 'Which trophic level converts solar energy into chemical energy in a food web?',
      options: [
        { id: 'a', label: 'Primary Consumers (Herbivores)', votes: 4 },
        { id: 'b', label: 'Producers (Green Plants)', votes: 29 },
        { id: 'c', label: 'Secondary Consumers', votes: 3 },
        { id: 'd', label: 'Decomposers', votes: 5 },
      ],
    })
  );

  const liveClasses = db.prepare('SELECT id, title, subject, chapter FROM live_classes').all() as Array<{
    id: string;
    title: string;
    subject: string;
    chapter: string;
  }>;

  const insBoard = db.prepare(
    `INSERT OR IGNORE INTO session_boards (live_class_id, allow_student_draw, active_slide_index, slides_json)
     VALUES (?, ?, ?, ?)`
  );
  const insMaterial = db.prepare(
    `INSERT OR IGNORE INTO session_materials (id, live_class_id, category, title, file_type, pages_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insPoll = db.prepare(
    `INSERT OR IGNORE INTO session_polls (id, live_class_id, prompt, options_json, status)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insQuiz = db.prepare(
    `INSERT OR IGNORE INTO session_quizzes (id, live_class_id, title, prompt, options_json, correct_index, duration_sec, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const cls of liveClasses) {
    const starterSlides = [
      {
        id: `slide-${cls.id}-1`,
        title: '1. Concept Overview & Vector Diagram',
        theme: 'blackboard',
        grid: 'grid',
        elements: [
          {
            id: `el-${cls.id}-title`,
            type: 'text',
            authorId: 'IL-FAC-118',
            authorName: 'Faculty',
            color: '#F8FAFC',
            strokeWidth: 2,
            x: 56,
            y: 62,
            fontSize: 26,
            text: `${cls.subject}: ${cls.title}`,
          },
          {
            id: `el-${cls.id}-note`,
            type: 'sticky',
            authorId: 'IL-FAC-118',
            authorName: 'Faculty',
            color: '#1E293B',
            fillColor: '#FEF08A',
            strokeWidth: 2,
            x: 56,
            y: 105,
            width: 310,
            height: 112,
            fontSize: 14,
            text:
              cls.id === 'live-5'
                ? 'Key Objective: Trace energy flow across Producers → Herbivores → Carnivores → Decomposers in a Food Web.'
                : `Key Objective: Master core formulas, diagrams, and exam shortcuts for ${cls.chapter}.`,
          },
          {
            id: `el-${cls.id}-box`,
            type: 'rect',
            authorId: 'IL-FAC-118',
            authorName: 'Faculty',
            color: '#38BDF8',
            strokeWidth: 3,
            x: 430,
            y: 105,
            width: 240,
            height: 95,
          },
          {
            id: `el-${cls.id}-arrow`,
            type: 'arrow',
            authorId: 'IL-FAC-118',
            authorName: 'Faculty',
            color: '#FBBF24',
            strokeWidth: 3,
            x: 685,
            y: 152,
            x2: 810,
            y2: 152,
          },
          {
            id: `el-${cls.id}-label`,
            type: 'text',
            authorId: 'IL-FAC-118',
            authorName: 'Faculty',
            color: '#38BDF8',
            strokeWidth: 2,
            x: 452,
            y: 158,
            fontSize: 18,
            text: cls.subject === 'Physics' ? 'F = q(v × B) | B = μ₀nI' : cls.subject === 'Biology' ? 'Food Web · Trophic Levels' : cls.chapter,
          },
        ],
      },
      {
        id: `slide-${cls.id}-2`,
        title: '2. Coordinate / Derivation Board',
        theme: 'chalkboard',
        grid: 'axes',
        elements: [
          {
            id: `el-${cls.id}-s2-h`,
            type: 'text',
            authorId: 'IL-FAC-118',
            authorName: 'Faculty',
            color: '#FDE68A',
            strokeWidth: 2,
            x: 48,
            y: 52,
            fontSize: 22,
            text: 'Live Derivation & Graph Workspace',
          },
        ],
      },
    ];
    insBoard.run(cls.id, 0, 0, JSON.stringify(starterSlides));

    const materialPages =
      cls.id === 'live-5'
        ? [
            {
              pageNo: 1,
              heading: 'Ramu School · Curriculum Teaching Packet',
              subheading: 'Session Index & Lesson Overview',
              tableRows: [
                {
                  seq: '1',
                  serial: '50',
                  chapter: 'How Nature Works in Harmony',
                  lesson: 'How Nature Works in Harmony - 1',
                  type: 'Teaching',
                  attachment: 'G8- How Nature Works in Harmony- 1.pptx',
                },
              ],
              bodyBullets: [
                'Topic: Who Eats Whom? · Sub Topic: Food Web',
                'Program: CBSE Grade 8 All Subjects Infinity One · Batch: M-8-235',
              ],
              keyFormula: '10% Energy Transfer Law (Lindeman): Eₙ₊₁ = 0.1 × Eₙ',
            },
            {
              pageNo: 2,
              heading: 'Who Eats Whom? — Trophic Pyramid & Food Web',
              subheading: 'Slide 2 of 2 · Interactive Teaching Deck',
              bodyBullets: [
                'Producers (Autotrophs): Grasses, algae, trees harness sunlight.',
                'Primary Consumers (Herbivores): Grasshopper, deer, rabbit.',
                'Secondary & Tertiary Consumers: Frog → Snake → Eagle.',
                'Food Webs provide ecosystem stability when one population fluctuates.',
              ],
              keyFormula: '6CO₂ + 6H₂O + Sunlight → C₆H₁₂O₆ + 6O₂',
            },
          ]
        : [
            {
              pageNo: 1,
              heading: `Ramu School · ${cls.subject} Lecture Deck`,
              subheading: `${cls.title}`,
              tableRows: [
                {
                  seq: '1',
                  serial: '01',
                  chapter: cls.chapter,
                  lesson: cls.title,
                  type: 'Teaching',
                  attachment: `${cls.id}-${cls.subject.replace(/\s+/g, '')}-Deck.pptx`,
                },
              ],
              bodyBullets: [
                `Core Chapter: ${cls.chapter}`,
                'Includes solved PYQs, live concept polls, and step-by-step derivation templates.',
              ],
            },
            {
              pageNo: 2,
              heading: `${cls.chapter} — Key Derivations & Exam Traps`,
              subheading: 'Slide 2 of 2 · Board Annotation Ready',
              bodyBullets: [
                'Draw clean Free-Body / Vector Diagrams before plugging numerical values.',
                'Verify SI units and sign conventions at every step.',
                'Save whiteboard snapshots directly into Classwork for post-class revision.',
              ],
            },
          ];

    const shortPrefix = cls.id === 'live-5' ? 'G8-Bio_HowNa' : `${cls.subject.slice(0, 4)}-Notes-${cls.id}`;
    insMaterial.run(
      `mat-note-${cls.id}`,
      cls.id,
      'note',
      cls.id === 'live-5' ? 'G8-Bio_HowNatureWorks_Notes.pdf' : `${shortPrefix}.pdf`,
      'PDF',
      JSON.stringify(materialPages)
    );
    insMaterial.run(
      `mat-slide-${cls.id}`,
      cls.id,
      'material',
      cls.id === 'live-5' ? 'G8-Bio-HowNatureWorksIn Harmony-1.pdf' : `${cls.chapter.slice(0, 24)}-Slides.pdf`,
      'PDF',
      JSON.stringify(materialPages)
    );

    insPoll.run(
      `poll-${cls.id}-1`,
      cls.id,
      cls.id === 'live-5'
        ? 'If primary consumers suddenly decline in a grassland food web, what happens first to producers?'
        : `Readiness check for ${cls.chapter}: Which area needs deeper focus today?`,
      JSON.stringify(
        cls.id === 'live-5'
          ? [
              { id: 'a', label: 'Producer population temporarily increases', votes: 14 },
              { id: 'b', label: 'Solar radiation drops immediately', votes: 1 },
              { id: 'c', label: 'Decomposers turn into autotrophs', votes: 2 },
            ]
          : [
              { id: 'a', label: 'Core Concept Derivation', votes: 12 },
              { id: 'b', label: 'Numerical Problem Solving', votes: 19 },
              { id: 'c', label: 'Previous Year Questions', votes: 9 },
            ]
      ),
      'Live'
    );

    insQuiz.run(
      `quiz-${cls.id}-1`,
      cls.id,
      `Pop Quiz · ${cls.chapter}`,
      cls.id === 'live-5'
        ? 'In a 4-level food chain receiving 10,000 J at the producer level, how much energy reaches tertiary consumers via Lindeman’s 10% law?'
        : `Quick Check on ${cls.chapter}: Which statement is scientifically accurate?`,
      JSON.stringify(
        cls.id === 'live-5'
          ? ['1000 J', '100 J', '10 J', '1 J']
          : [
              'Energy & momentum conservation hold in isolated systems',
              'Unit conversion can be skipped in MCQ ratios',
              'Vector direction is independent of sign convention',
              'None of the above',
            ]
      ),
      cls.id === 'live-5' ? 2 : 0,
      60,
      'Live'
    );
  }
}

function seedInitialDataIfEmpty(): void {
  const existingUserCount = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number };
  if (existingUserCount.cnt > 0) return;

  db.exec('BEGIN');
  try {
    const insertUser = db.prepare(`
      INSERT INTO users (
        id, role, name, initials, email, phone, admission_id, password_hash, dob_pin,
        track, program_name, grade, daily_goal_hours, streak_days, weekly_hours_logged,
        avatar_url, login_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const u of SEED_USERS) {
      insertUser.run(
        u.id,
        u.role,
        u.name,
        u.initials,
        u.email,
        u.phone,
        u.admissionId,
        hashPassword(u.defaultPassword),
        u.dobPin,
        u.track,
        u.programName,
        u.grade,
        u.dailyGoalHours,
        u.streakDays,
        u.weeklyHoursLogged,
        u.avatarUrl,
        u.loginMethod
      );
    }

    const insertChapter = db.prepare(`
      INSERT INTO chapters (id, subject, title, unit, weightage, mastery_percent, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLesson = db.prepare(`
      INSERT INTO lessons (
        id, chapter_id, title, duration_min, type, instructor, summary,
        key_formulas_json, timestamps_json, notes_content, default_completed, default_bookmarked, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    INITIAL_CHAPTERS.forEach((ch, chIdx) => {
      insertChapter.run(ch.id, ch.subject, ch.title, ch.unit, ch.weightage, ch.masteryPercent, chIdx);
      ch.lessons.forEach((les, lesIdx) => {
        insertLesson.run(
          les.id,
          ch.id,
          les.title,
          les.durationMin,
          les.type,
          les.instructor,
          les.summary,
          JSON.stringify(les.keyFormulas),
          JSON.stringify(les.timestamps),
          les.notesContent,
          les.completed ? 1 : 0,
          les.bookmarked ? 1 : 0,
          lesIdx
        );
      });
    });

    const insertLive = db.prepare(`
      INSERT INTO live_classes (
        id, title, subject, instructor, instructor_role, instructor_avatar, status,
        scheduled_time, date_label, time_range, grade_label, language, track, chapter,
        attendees_count, whiteboard_notes_json, poll_question_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertReminder = db.prepare(`
      INSERT OR IGNORE INTO user_live_reminders (user_id, live_class_id, reminded) VALUES (?, ?, ?)
    `);

    for (const cls of INITIAL_LIVE_CLASSES) {
      insertLive.run(
        cls.id,
        cls.title,
        cls.subject,
        cls.instructor,
        cls.instructorRole,
        cls.instructorAvatar,
        cls.status,
        cls.scheduledTime,
        cls.dateLabel,
        cls.timeRange,
        cls.gradeLabel,
        cls.language,
        cls.track,
        cls.chapter,
        cls.attendeesCount,
        JSON.stringify(cls.whiteboardNotes),
        JSON.stringify(cls.pollQuestion)
      );
      if (cls.reminded) {
        insertReminder.run(SEED_USERS[0].id, cls.id, 1);
      }
    }

    // Seed initial classroom chat messages for live-1
    const insertChat = db.prepare(
      'INSERT INTO live_class_chat (live_class_id, author, text) VALUES (?, ?, ?)'
    );
    insertChat.run(
      'live-1',
      'Priya (Student)',
      'Ma’am, does the magnetic field inside a solenoid depend on its radius?'
    );
    insertChat.run(
      'live-1',
      'Prof. Priya Menon',
      'No, for a long ideal solenoid B = μ₀nI is independent of radius and uniform across the cross-section.'
    );

    const insertQuestion = db.prepare(`
      INSERT INTO questions (
        id, subject, chapter_id, chapter_title, difficulty, prompt,
        options_json, correct_index, explanation, formula_used, avg_time_sec
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const q of QUESTION_BANK) {
      insertQuestion.run(
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
        q.avgTimeSec
      );
    }

    const insertMock = db.prepare(`
      INSERT INTO mock_tests (
        id, title, category, subjects_json, duration_min, total_marks, negative_marking, difficulty, question_ids_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of MOCK_TESTS) {
      insertMock.run(
        m.id,
        m.title,
        m.category,
        JSON.stringify(m.subjects),
        m.durationMin,
        m.totalMarks,
        m.negativeMarking ? 1 : 0,
        m.difficulty,
        JSON.stringify(m.questionIds)
      );
    }

    const insertAttempt = db.prepare(`
      INSERT INTO test_attempts (
        id, user_id, test_title, category, date_label, score, max_score, accuracy_percent,
        time_spent_min, correct_count, incorrect_count, unattempted_count, subject_breakdown_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const att of INITIAL_TEST_HISTORY) {
      insertAttempt.run(
        att.id,
        SEED_USERS[0].id,
        att.testTitle,
        att.category,
        att.dateLabel,
        att.score,
        att.maxScore,
        att.accuracyPercent,
        att.timeSpentMin,
        att.correctCount,
        att.incorrectCount,
        att.unattemptedCount,
        JSON.stringify(att.subjectBreakdown)
      );
    }

    const insertErr = db.prepare(
      'INSERT OR IGNORE INTO user_error_log (user_id, question_id) VALUES (?, ?)'
    );
    for (const qid of SEED_ERROR_LOG_IDS) {
      insertErr.run(SEED_USERS[0].id, qid);
    }

    const insertDpp = db.prepare(`
      INSERT INTO dpp_sheets (id, title, subject, date_label, estimated_min, question_ids_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertDppProgress = db.prepare(`
      INSERT OR IGNORE INTO user_dpp_progress (user_id, dpp_id, completed) VALUES (?, ?, ?)
    `);
    for (const dpp of INITIAL_DPP_SHEETS) {
      insertDpp.run(
        dpp.id,
        dpp.title,
        dpp.subject,
        dpp.dateLabel,
        dpp.estimatedMin,
        JSON.stringify(dpp.questionIds)
      );
      if (dpp.completed) {
        insertDppProgress.run(SEED_USERS[0].id, dpp.id, 1);
      }
    }

    const insertNcert = db.prepare(`
      INSERT INTO ncert_solutions (id, subject, chapter, exercise_ref, question, solution_steps_json, final_answer)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const n of NCERT_SOLUTIONS) {
      insertNcert.run(
        n.id,
        n.subject,
        n.chapter,
        n.exerciseRef,
        n.question,
        JSON.stringify(n.solutionSteps),
        n.finalAnswer
      );
    }

    const insertFlash = db.prepare(`
      INSERT INTO flashcards (id, subject, chapter, front, hint, back, formula, default_status, default_bookmarked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const fc of INITIAL_FLASHCARDS) {
      insertFlash.run(
        fc.id,
        fc.subject,
        fc.chapter,
        fc.front,
        fc.hint,
        fc.back,
        fc.formula,
        fc.status,
        fc.bookmarked ? 1 : 0
      );
    }

    const insertTask = db.prepare(`
      INSERT INTO study_tasks (id, user_id, title, subject, day, duration_min, completed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of INITIAL_STUDY_TASKS) {
      insertTask.run(t.id, SEED_USERS[0].id, t.title, t.subject, t.day, t.durationMin, t.completed ? 1 : 0);
    }

    const insertAssignment = db.prepare(`
      INSERT INTO teacher_assignments (id, title, subject, grade_label, due_date, submitted_count, total_students, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of INITIAL_TEACHER_ASSIGNMENTS) {
      insertAssignment.run(
        a.id,
        a.title,
        a.subject,
        a.gradeLabel,
        a.dueDate,
        a.submittedCount,
        a.totalStudents,
        a.status
      );
    }

    const insertAttendance = db.prepare(`
      INSERT INTO attendance_roster (id, name, roll_no, status) VALUES (?, ?, ?, ?)
    `);
    for (const stu of INITIAL_ATTENDANCE_ROSTER) {
      insertAttendance.run(stu.id, stu.name, stu.rollNo, stu.status);
    }

    const insertLeaderboard = db.prepare(`
      INSERT INTO leaderboard_entries (rank, name, city, track, tests_taken, accuracy_percent, score_points, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const lb of BATCH_LEADERBOARD) {
      insertLeaderboard.run(
        lb.rank,
        lb.name,
        lb.city,
        lb.track,
        lb.testsTaken,
        lb.accuracyPercent,
        lb.scorePoints,
        lb.isCurrentUser ? SEED_USERS[0].id : null
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
