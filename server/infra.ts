import type { NextFunction, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { GamificationBadge, GamificationSummary } from '../src/types/portal.ts';

// ============================================================================
// 1. HIGH-CONCURRENCY SQLITE TUNING & PRODUCTION B-TREE INDEXING (1L+ USERS)
// ============================================================================

export function configureHighScaleSqlite(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA cache_size = -64000;'); // 64 MB memory page cache
  db.exec('PRAGMA temp_store = MEMORY;');
}

export function ensureProductionIndexes(db: DatabaseSync): number {
  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_users_role_track ON users(role, track)',
    'CREATE INDEX IF NOT EXISTS idx_users_batch ON users(batch_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_otp_phone_id ON otp_challenges(phone, id)',
    'CREATE INDEX IF NOT EXISTS idx_lessons_chapter_sort ON lessons(chapter_id, sort_order)',
    'CREATE INDEX IF NOT EXISTS idx_live_classes_status ON live_classes(status)',
    'CREATE INDEX IF NOT EXISTS idx_live_chat_class ON live_class_chat(live_class_id, id)',
    'CREATE INDEX IF NOT EXISTS idx_questions_subject_diff ON questions(subject, difficulty)',
    'CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter_id)',
    'CREATE INDEX IF NOT EXISTS idx_test_attempts_user_created ON test_attempts(user_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_dpp_subject ON dpp_sheets(subject)',
    'CREATE INDEX IF NOT EXISTS idx_study_tasks_user_day ON study_tasks(user_id, day)',
    'CREATE INDEX IF NOT EXISTS idx_saved_doubts_user ON saved_doubts(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets(user_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_courses_track_status ON courses(track, status, is_featured)',
    'CREATE INDEX IF NOT EXISTS idx_enrollments_user_course ON enrollments(user_id, course_id)',
    'CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_community_posts_subject ON community_posts(subject, status, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_community_replies_post ON community_replies(post_id, created_at ASC)',
    'CREATE INDEX IF NOT EXISTS idx_mentorship_student ON mentorship_sessions(student_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_learning_events_user ON learning_events(user_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON admin_audit_logs(id DESC)',
  ];

  for (const sql of indexStatements) {
    db.exec(sql);
  }

  const row = db
    .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
    .get() as { c: number };
  return row.c;
}

// ============================================================================
// 2. IN-MEMORY TTL QUERY CACHE (REDUCES DB READ LOAD AT 1L+ SCALE)
// ============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlQueryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = 15_000): void {
    if (this.store.size > 1000) {
      // Evict oldest entry cleanly
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      entries: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRatePercent: total === 0 ? 100 : Math.round((this.hits / total) * 100),
    };
  }
}

export const queryCache = new TtlQueryCache();

// ============================================================================
// 3. SLIDING-WINDOW API RATE LIMITER
// ============================================================================

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let totalApiRequests = 0;
let blockedApiRequests = 0;

export function createRateLimiter(maxRequestsPerMin = 600) {
  return (req: Request, res: Response, next: NextFunction): void => {
    totalApiRequests += 1;
    const now = Date.now();
    const clientIp = req.ip || req.socket.remoteAddress || 'local';
    const key = `${clientIp}`;
    const existing = rateBuckets.get(key);

    if (!existing || now > existing.resetAt) {
      if (rateBuckets.size > 5000) {
        rateBuckets.clear();
      }
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > maxRequestsPerMin) {
      blockedApiRequests += 1;
      res.status(429).json({
        error: 'Rate limit exceeded. Please pause briefly before retrying.',
      });
      return;
    }

    next();
  };
}

export function getRateLimiterStats() {
  return {
    trackedBuckets: rateBuckets.size,
    totalRequests: totalApiRequests,
    blockedRequests: blockedApiRequests,
  };
}

// ============================================================================
// 4. MEASURABLE LEARNING EVENT TELEMETRY & GAMIFICATION XP ENGINE
// ============================================================================

const LEVEL_TITLES = [
  'Foundation Scholar',
  'Concept Explorer',
  'Daily Ranker',
  'Problem Tactician',
  'Olympiad Contender',
  'All-India Top 5%',
  'Grandmaster Scholar',
];

export function computeLevelFromXp(xp: number): {
  level: number;
  levelTitle: string;
  nextLevelXp: number;
} {
  const level = Math.max(1, Math.floor(xp / 500) + 1);
  const levelTitle = LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, level - 1)];
  const nextLevelXp = level * 500;
  return { level, levelTitle, nextLevelXp };
}

export function buildGamificationSummary(
  db: DatabaseSync,
  userId: string,
  streakDays: number
): GamificationSummary {
  const row = db
    .prepare('SELECT xp_points, badges_json FROM user_gamification WHERE user_id = ?')
    .get(userId) as { xp_points: number; badges_json: string } | undefined;

  const xpPoints = row?.xp_points ?? 350;
  const { level, levelTitle, nextLevelXp } = computeLevelFromXp(xpPoints);

  const testCount = (
    db.prepare('SELECT COUNT(*) AS c FROM test_attempts WHERE user_id = ?').get(userId) as {
      c: number;
    }
  ).c;
  const doubtCount = (
    db.prepare('SELECT COUNT(*) AS c FROM community_posts WHERE author_id = ?').get(userId) as {
      c: number;
    }
  ).c;
  const enrollmentCount = (
    db.prepare('SELECT COUNT(*) AS c FROM enrollments WHERE user_id = ?').get(userId) as {
      c: number;
    }
  ).c;

  let customBadges: string[] = [];
  if (row?.badges_json) {
    try {
      const parsed = JSON.parse(row.badges_json);
      if (Array.isArray(parsed)) customBadges = parsed;
    } catch {
      customBadges = [];
    }
  }

  const badges: GamificationBadge[] = [
    {
      id: 'streak-7',
      label: '7-Day Study Streak',
      description: 'Maintained consistent daily study momentum for 7+ days',
      earned: streakDays >= 7 || customBadges.includes('streak-7'),
    },
    {
      id: 'cbt-finisher',
      label: 'CBT Test Challenger',
      description: 'Completed mock assessments inside the timed exam simulator',
      earned: testCount >= 1 || customBadges.includes('cbt-finisher'),
    },
    {
      id: 'xp-1000',
      label: '1,000 XP Scholar',
      description: 'Accumulated 1,000+ academic XP across lectures, quizzes, and tests',
      earned: xpPoints >= 1000 || customBadges.includes('xp-1000'),
    },
    {
      id: 'community-helper',
      label: 'Peer Doubt Mentor',
      description: 'Shared academic doubts or solutions in Ramu School Community',
      earned: doubtCount >= 1 || customBadges.includes('community-helper'),
    },
    {
      id: 'enrolled-scholar',
      label: 'Batch Program Scholar',
      description: 'Enrolled in an active Ramu School structured batch',
      earned: enrollmentCount >= 1 || customBadges.includes('enrolled-scholar'),
    },
  ];

  return {
    xpPoints,
    level,
    levelTitle,
    nextLevelXp,
    streakDays,
    badges,
  };
}

export function recordLearningEvent(
  db: DatabaseSync,
  userId: string,
  eventType: string,
  entityType: string,
  entityId: string,
  xpDelta = 15,
  metadata: Record<string, unknown> = {}
): void {
  try {
    db.prepare(
      `INSERT INTO learning_events (user_id, event_type, entity_type, entity_id, xp_delta, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, eventType, entityType, entityId, xpDelta, JSON.stringify(metadata));

    if (xpDelta > 0) {
      const existing = db
        .prepare('SELECT xp_points, badges_json FROM user_gamification WHERE user_id = ?')
        .get(userId) as { xp_points: number; badges_json: string } | undefined;

      if (existing) {
        const nextXp = existing.xp_points + xpDelta;
        const { level } = computeLevelFromXp(nextXp);
        db.prepare(
          "UPDATE user_gamification SET xp_points = ?, level = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextXp, level, userId);
      } else {
        const nextXp = 250 + xpDelta;
        const { level } = computeLevelFromXp(nextXp);
        db.prepare(
          'INSERT INTO user_gamification (user_id, xp_points, level, badges_json) VALUES (?, ?, ?, ?)'
        ).run(userId, nextXp, level, JSON.stringify(['streak-7']));
      }
    }
  } catch {
    // Non-blocking telemetry
  }
}
