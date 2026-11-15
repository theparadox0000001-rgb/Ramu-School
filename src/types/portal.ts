export type ExamTrack = 'IIT-JEE' | 'NEET UG' | 'CBSE Class 12' | 'CBSE Grade 10';

export type LoginMethod = 'otp' | 'password' | 'admission';

export type PortalRole = 'student' | 'teacher' | 'admin' | 'parent';

export type NavSection =
  | 'dashboard'
  | 'live'
  | 'courses'
  | 'tests'
  | 'aina'
  | 'marketplace'
  | 'community'
  | 'bookmarks'
  | 'analytics'
  | 'subscriptions'
  | 'refer'
  | 'contact';

export type SubjectName =
  | 'Physics'
  | 'Chemistry'
  | 'Mathematics'
  | 'Biology'
  | 'English'
  | 'Vedic Mathematics'
  | 'Social Science';

export type DifficultyLevel = 'Foundation' | 'Moderate' | 'Advanced';

export interface StudentProfile {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  admissionId: string;
  track: ExamTrack;
  programName: string;
  grade: string;
  dailyGoalHours: number;
  streakDays: number;
  weeklyHoursLogged: number;
  avatarUrl: string;
  loginMethod: LoginMethod;
  role: PortalRole;
  batchId?: string;
  campus?: string;
  subjects?: SubjectName[];
}

export interface LessonItem {
  id: string;
  title: string;
  durationMin: number;
  type: 'video' | 'notes' | 'practice';
  completed: boolean;
  bookmarked: boolean;
  instructor: string;
  summary: string;
  keyFormulas: string[];
  timestamps: Array<{ time: string; label: string }>;
  notesContent: string;
}

export interface ChapterItem {
  id: string;
  subject: SubjectName;
  title: string;
  unit: string;
  weightage: string;
  masteryPercent: number;
  lessons: LessonItem[];
}

export interface LiveClassItem {
  id: string;
  title: string;
  subject: SubjectName;
  instructor: string;
  instructorRole: string;
  instructorAvatar: string;
  status: 'live' | 'upcoming' | 'recorded';
  scheduledTime: string;
  dateLabel: string;
  timeRange: string;
  gradeLabel: string;
  language: string;
  track: ExamTrack;
  chapter: string;
  reminded: boolean;
  attendeesCount: number;
  whiteboardNotes: string[];
  pollQuestion: {
    prompt: string;
    options: Array<{ id: string; label: string; votes: number }>;
  };
}

export interface QuestionItem {
  id: string;
  subject: SubjectName;
  chapterId: string;
  chapterTitle: string;
  difficulty: DifficultyLevel;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  formulaUsed: string;
  avgTimeSec: number;
}

export interface MockTestTemplate {
  id: string;
  title: string;
  category: 'All India Test Series' | 'Chapter Mastery' | 'Previous Year Paper' | 'CYOT Custom';
  subjects: SubjectName[];
  durationMin: number;
  totalMarks: number;
  negativeMarking: boolean;
  difficulty: DifficultyLevel;
  questionIds: string[];
}

export interface TestAttemptRecord {
  id: string;
  testTitle: string;
  category: string;
  dateLabel: string;
  score: number;
  maxScore: number;
  accuracyPercent: number;
  timeSpentMin: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  subjectBreakdown: Array<{
    subject: SubjectName;
    correct: number;
    total: number;
    accuracy: number;
  }>;
  responses?: Record<string, number | null>;
  questionIds?: string[];
}

export type FlashcardStatus = 'new' | 'practice' | 'good' | 'mastered';

export interface FlashcardItem {
  id: string;
  subject: SubjectName;
  chapter: string;
  front: string;
  hint: string;
  back: string;
  formula: string;
  status: FlashcardStatus;
  bookmarked: boolean;
}

export interface SavedDoubt {
  id: string;
  subject: SubjectName;
  question: string;
  answer: string;
  mode: 'hint' | 'full';
  createdAt: string;
}

export interface StudyTask {
  id: string;
  title: string;
  subject: SubjectName;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  durationMin: number;
  completed: boolean;
}

export interface SupportTicket {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: 'Open' | 'Resolved';
  createdAt: string;
}

export interface NcertSolutionItem {
  id: string;
  subject: SubjectName;
  chapter: string;
  exerciseRef: string;
  question: string;
  solutionSteps: string[];
  finalAnswer: string;
}

export interface DppSheetItem {
  id: string;
  title: string;
  subject: SubjectName;
  dateLabel: string;
  estimatedMin: number;
  questionIds: string[];
  completed: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  city: string;
  track: ExamTrack;
  testsTaken: number;
  accuracyPercent: number;
  scorePoints: number;
  isCurrentUser?: boolean;
}

export interface TeacherAssignment {
  id: string;
  title: string;
  subject: SubjectName;
  gradeLabel: string;
  dueDate: string;
  submittedCount: number;
  totalStudents: number;
  status: 'Active' | 'Graded';
}

export interface AttendanceStudent {
  id: string;
  name: string;
  rollNo: string;
  status: 'Present' | 'Late' | 'Absent';
}

export interface BackendBootstrapPayload {
  user: StudentProfile;
  chapters: ChapterItem[];
  liveClasses: LiveClassItem[];
  questions: QuestionItem[];
  mockTests: MockTestTemplate[];
  testHistory: TestAttemptRecord[];
  errorLogIds: string[];
  dppSheets: DppSheetItem[];
  ncertSolutions: NcertSolutionItem[];
  flashcards: FlashcardItem[];
  tasks: StudyTask[];
  savedDoubts: SavedDoubt[];
  tickets: SupportTicket[];
  leaderboard: LeaderboardEntry[];
  teacherAssignments: TeacherAssignment[];
  attendanceRoster: AttendanceStudent[];
  platformConfig?: PlatformConfig;
  notifications?: NotificationItem[];
  enrollments?: EnrollmentItem[];
  gamification?: GamificationSummary;
}

export interface ContentStats {
  databaseEngine: string;
  counts: {
    users: number;
    chapters: number;
    lessons: number;
    questions: number;
    dppSheets: number;
    ncertSolutions: number;
    mockTests: number;
    flashcards: number;
    liveClasses: number;
  };
}

export interface AdminUserRecord {
  id: string;
  role: PortalRole;
  name: string;
  initials: string;
  email: string;
  phone: string;
  admissionId: string;
  track: ExamTrack;
  programName: string;
  grade: string;
  streakDays: number;
  weeklyHoursLogged: number;
  createdAt: string;
  batchId?: string;
  batchCode?: string;
  batchName?: string;
  campus?: string;
  subjects?: SubjectName[];
}

export interface BatchCohort {
  id: string;
  code: string;
  name: string;
  track: ExamTrack;
  campus: string;
  leadFaculty: string;
  studentCount: number;
  capacity: number;
  scheduleSlot: string;
  status: 'Active' | 'Upcoming' | 'Archived';
  createdAt?: string;
}

export interface AdminTicketRecord extends SupportTicket {
  userId: string;
  userName: string;
  userEmail: string;
  admissionId: string;
}

export interface AdminRecentAttempt {
  id: string;
  userId: string;
  studentName: string;
  admissionId: string;
  testTitle: string;
  category: string;
  dateLabel: string;
  score: number;
  maxScore: number;
  accuracyPercent: number;
}

export interface AdminAuditLog {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface AdminOverviewPayload {
  metrics: {
    totalUsers: number;
    studentCount: number;
    teacherCount: number;
    adminCount: number;
    activeBatches: number;
    totalBatches: number;
    totalChapters: number;
    totalLessons: number;
    totalQuestions: number;
    totalMockTests: number;
    totalLiveClasses: number;
    totalDppSheets: number;
    totalNcertSolutions: number;
    totalFlashcards: number;
    openTicketsCount: number;
    totalTestAttempts: number;
    avgAccuracyPercent: number;
  };
  users: AdminUserRecord[];
  batches: BatchCohort[];
  tickets: AdminTicketRecord[];
  recentAttempts: AdminRecentAttempt[];
  auditLogs: AdminAuditLog[];
  chapters: ChapterItem[];
  liveClasses: LiveClassItem[];
  questions: QuestionItem[];
  mockTests: MockTestTemplate[];
  dppSheets: DppSheetItem[];
  ncertSolutions: NcertSolutionItem[];
  flashcards: FlashcardItem[];
}

export interface AdminStudentSummary extends AdminUserRecord {
  testsTaken: number;
  avgAccuracyPercent: number;
  bestScorePercent: number;
  lessonsCompleted: number;
  totalLessons: number;
  errorLogCount: number;
  dppCompletedCount: number;
  openTicketsCount: number;
  savedDoubtsCount: number;
}

export interface AdminStudentDetailPayload {
  student: AdminUserRecord;
  batch: BatchCohort | null;
  testAttempts: TestAttemptRecord[];
  chapters: ChapterItem[];
  errorLogQuestions: QuestionItem[];
  dppSheets: DppSheetItem[];
  tasks: StudyTask[];
  savedDoubts: SavedDoubt[];
  tickets: SupportTicket[];
  flashcards: FlashcardItem[];
}

export interface AdminTeacherSummary extends AdminUserRecord {
  liveClassesCount: number;
  upcomingClassesCount: number;
  recordedClassesCount: number;
  batchesLedCount: number;
  assignmentsCount: number;
  totalAttendeesReached: number;
}

export interface AdminTeacherDetailPayload {
  teacher: AdminUserRecord;
  assignedBatches: BatchCohort[];
  liveClasses: Array<
    LiveClassItem & {
      chatCount: number;
      totalPollVotes: number;
    }
  >;
  assignments: TeacherAssignment[];
  attendanceRoster: AttendanceStudent[];
  batchStudents: AdminUserRecord[];
}

export interface AdminTestSummary extends MockTestTemplate {
  attemptsCount: number;
  avgScore: number;
  avgAccuracyPercent: number;
  highestScore: number;
}

export interface AdminTestAttemptRow extends AdminRecentAttempt {
  studentEmail: string;
  batchCode: string;
  timeSpentMin: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  subjectBreakdown: TestAttemptRecord['subjectBreakdown'];
  responses?: Record<string, number | null>;
  questionIds?: string[];
}

export interface AdminTestQuestionStat {
  question: QuestionItem;
  attemptsCount: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  correctRatePercent: number;
  optionCounts: [number, number, number, number];
}

export interface AdminTestDetailPayload {
  mockTest: MockTestTemplate;
  questionStats: AdminTestQuestionStat[];
  attempts: AdminTestAttemptRow[];
  allQuestions: QuestionItem[];
}

export interface AdminAttemptAnswerSheetItem {
  question: QuestionItem;
  selectedOptionIndex: number | null;
  isCorrect: boolean;
  isAttempted: boolean;
}

export interface AdminAttemptDetailPayload {
  attempt: AdminTestAttemptRow;
  items: AdminAttemptAnswerSheetItem[];
}

export interface AdminInjectDailyQuiz {
  mode: 'dpp' | 'mock_test' | 'both';
  title: string;
  subject: SubjectName;
  subjects?: SubjectName[];
  category?: MockTestTemplate['category'];
  difficulty?: DifficultyLevel;
  durationMin?: number;
  dateLabel?: string;
  negativeMarking?: boolean;
  questions: Array<
    Partial<QuestionItem> & {
      prompt: string;
      options: [string, string, string, string];
      correctIndex: number;
    }
  >;
}

export interface AdminInjectPayload {
  dailyQuiz?: AdminInjectDailyQuiz;
  questions?: Array<Partial<QuestionItem>>;
  dppSheets?: Array<Partial<DppSheetItem>>;
  mockTests?: Array<Partial<MockTestTemplate>>;
  chapters?: Array<Partial<ChapterItem>>;
  ncertSolutions?: Array<Partial<NcertSolutionItem>>;
  flashcards?: Array<Partial<FlashcardItem>>;
  liveClasses?: Array<Partial<LiveClassItem>>;
  batches?: Array<Partial<BatchCohort>>;
  users?: Array<{
    id?: string;
    name: string;
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
  }>;
}

export interface AdminInjectResult {
  ok: boolean;
  totalUpserted: number;
  createdDppId?: string;
  createdMockTestId?: string;
  counts: {
    questions: number;
    dppSheets: number;
    mockTests: number;
    chapters: number;
    lessons: number;
    ncertSolutions: number;
    flashcards: number;
    liveClasses: number;
    batches: number;
    users: number;
  };
}

export interface PlatformConfig {
  institutionName: string;
  tagline: string;
  maintenanceMode: boolean;
  allowPublicSignup: boolean;
  aiMentorEnabled: boolean;
  marketplaceEnabled: boolean;
  communityEnabled: boolean;
  parentPortalEnabled: boolean;
  scholarshipOpen: boolean;
  maxSessionsPerUser: number;
  updatedAt?: string;
}

export interface CourseItem {
  id: string;
  title: string;
  subtitle: string;
  track: ExamTrack;
  subjectFocus: string;
  instructor: string;
  priceInr: number;
  mrpInr: number;
  durationMonths: number;
  rating: number;
  reviewsCount: number;
  enrolledCount: number;
  badge: string;
  syllabusHighlights: string[];
  isFeatured: boolean;
  status: 'Published' | 'Draft' | 'Archived';
}

export interface CouponItem {
  code: string;
  discountPercent: number;
  maxDiscountInr: number;
  minOrderInr: number;
  usageLimit: number;
  usedCount: number;
  active: boolean;
  expiresAt: string;
}

export interface EnrollmentItem {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  status: 'Active' | 'Expired' | 'Revoked';
  validUntil: string;
  progressPercent: number;
  enrolledAt: string;
}

export interface OrderRecord {
  id: string;
  userId: string;
  studentName?: string;
  studentEmail?: string;
  courseId: string;
  courseTitle: string;
  amountPaidInr: number;
  discountInr: number;
  couponCode: string | null;
  paymentMethod: 'UPI' | 'Card' | 'NetBanking' | 'EMI' | 'AdminGrant';
  status: 'Paid' | 'Refunded' | 'Failed';
  invoiceNo: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: 'LiveClass' | 'Quiz' | 'TestResult' | 'Announcement' | 'Payment' | 'Scholarship';
  isRead: boolean;
  createdAt: string;
}

export interface CommunityReply {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorRole: PortalRole;
  body: string;
  isAccepted: boolean;
  createdAt: string;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: PortalRole;
  subject: SubjectName;
  chapterTitle: string;
  title: string;
  body: string;
  upvotes: number;
  status: 'Open' | 'Resolved' | 'Escalated';
  createdAt: string;
  replies: CommunityReply[];
}

export interface MentorshipSession {
  id: string;
  studentId: string;
  studentName: string;
  mentorName: string;
  mentorRole: string;
  topic: string;
  scheduledSlot: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  actionNotes: string;
  createdAt: string;
}

export interface ScholarshipExam {
  id: string;
  title: string;
  code: string;
  track: ExamTrack;
  examDateLabel: string;
  durationMin: number;
  maxScholarshipPercent: number;
  prizePool: string;
  registeredCount: number;
  status: 'Open' | 'Upcoming' | 'Closed';
  isRegistered?: boolean;
  admitCardCode?: string;
}

export interface GamificationBadge {
  id: string;
  label: string;
  description: string;
  earned: boolean;
}

export interface GamificationSummary {
  xpPoints: number;
  level: number;
  levelTitle: string;
  nextLevelXp: number;
  streakDays: number;
  badges: GamificationBadge[];
}

export interface ActiveSessionInfo {
  tokenPrefix: string;
  userId: string;
  userName: string;
  userRole: PortalRole;
  loginMethod: LoginMethod;
  createdAt: string;
  expiresAt: string;
  isCurrent?: boolean;
}

export interface SystemHealthMetrics {
  databaseEngine: string;
  dbSizeKb: number;
  walMode: boolean;
  indexCount: number;
  scaleCapacityTarget: string;
  uptimeSec: number;
  cacheStats: {
    entries: number;
    hits: number;
    misses: number;
    hitRatePercent: number;
  };
  rateLimiterStats: {
    trackedBuckets: number;
    totalRequests: number;
    blockedRequests: number;
  };
  activeSessionsCount: number;
  activeSessions: ActiveSessionInfo[];
  tableCounts: Array<{ table: string; rows: number }>;
  recentEvents: Array<{
    id: number;
    userId: string;
    userName: string;
    eventType: string;
    entityType: string;
    entityId: string;
    xpDelta: number;
    createdAt: string;
  }>;
}

export interface ParentDashboardPayload {
  parent: StudentProfile;
  linkedChildren: Array<{
    student: AdminUserRecord;
    batch: BatchCohort | null;
    testsTaken: number;
    avgAccuracyPercent: number;
    lessonsCompleted: number;
    totalLessons: number;
    attendancePercent: number;
    weakChapters: Array<{ title: string; subject: SubjectName; masteryPercent: number }>;
    recentAttempts: TestAttemptRecord[];
    mentorshipSessions: MentorshipSession[];
    orders: OrderRecord[];
    enrollments: EnrollmentItem[];
  }>;
}

export interface AdminCommercePayload {
  courses: CourseItem[];
  coupons: CouponItem[];
  orders: OrderRecord[];
  enrollments: EnrollmentItem[];
  revenueSummary: {
    totalRevenueInr: number;
    paidOrdersCount: number;
    refundedOrdersCount: number;
    activeEnrollmentsCount: number;
  };
}

export type BoardTheme = 'blackboard' | 'chalkboard' | 'whiteboard';

export type BoardGridType = 'none' | 'grid' | 'lined' | 'axes';

export type BoardToolType =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'laser'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'dashed'
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'text'
  | 'sticky'
  | 'graph';

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardElement {
  id: string;
  type:
    | 'pen'
    | 'highlighter'
    | 'line'
    | 'arrow'
    | 'dashed'
    | 'rect'
    | 'circle'
    | 'triangle'
    | 'text'
    | 'sticky'
    | 'image'
    | 'graph';
  authorId: string;
  authorName: string;
  color: string;
  strokeWidth: number;
  opacity?: number;
  points?: BoardPoint[];
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fillColor?: string;
  graphPreset?: 'sine' | 'parabola' | 'axes';
  imageDataUrl?: string;
}

export interface BoardSlide {
  id: string;
  title: string;
  theme?: BoardTheme;
  grid?: BoardGridType;
  backgroundDataUrl?: string;
  backgroundLabel?: string;
  elements: BoardElement[];
}

export interface SessionBoardState {
  liveClassId: string;
  allowStudentDraw: boolean;
  activeSlideIndex: number;
  slides: BoardSlide[];
  updatedAt: string;
}

export interface MaterialSlidePage {
  pageNo: number;
  heading: string;
  subheading: string;
  tableRows?: Array<{
    seq: string;
    serial: string;
    chapter: string;
    lesson: string;
    type: string;
    attachment: string;
  }>;
  bodyBullets: string[];
  keyFormula?: string;
}

export interface SessionMaterialItem {
  id: string;
  liveClassId: string;
  category: 'note' | 'material';
  title: string;
  fileType: 'PDF' | 'PPTX' | 'DOC' | 'AUDIO' | 'VIDEO';
  pages: MaterialSlidePage[];
  createdAt: string;
}

export interface SessionPollItem {
  id: string;
  liveClassId: string;
  prompt: string;
  options: Array<{ id: string; label: string; votes: number }>;
  status: 'Draft' | 'Live' | 'Closed';
  createdAt: string;
}

export interface SessionQuizItem {
  id: string;
  liveClassId: string;
  title: string;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  durationSec: number;
  status: 'Draft' | 'Live' | 'Closed';
  createdAt: string;
}

export interface SessionClassworkSnapshot {
  id: string;
  liveClassId: string;
  title: string;
  slideTitle: string;
  imageDataUrl: string;
  savedBy: string;
  createdAt: string;
}

export interface SessionWorkspacePayload {
  liveClass: LiveClassItem;
  objectives: string[];
  about: {
    exam: string;
    chapter: string;
    topic: string;
    subTopic: string;
    program: string;
    batch: string;
    durationMin: number;
  };
  materials: SessionMaterialItem[];
  polls: SessionPollItem[];
  quizzes: SessionQuizItem[];
  classwork: SessionClassworkSnapshot[];
  board: SessionBoardState;
  roster: AttendanceStudent[];
}




