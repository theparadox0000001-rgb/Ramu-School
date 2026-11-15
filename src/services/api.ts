import type {
  ActiveSessionInfo,
  AdminAttemptDetailPayload,
  AdminAuditLog,
  AdminCommercePayload,
  AdminInjectPayload,
  AdminInjectResult,
  AdminOverviewPayload,
  AdminStudentDetailPayload,
  AdminStudentSummary,
  AdminTeacherDetailPayload,
  AdminTeacherSummary,
  AdminTestAttemptRow,
  AdminTestDetailPayload,
  AdminTestSummary,
  AttendanceStudent,
  BackendBootstrapPayload,
  BatchCohort,
  CommunityPost,
  CommunityReply,
  ContentStats,
  CouponItem,
  CourseItem,
  DifficultyLevel,
  DppSheetItem,
  EnrollmentItem,
  ExamTrack,
  FlashcardItem,
  FlashcardStatus,
  GamificationSummary,
  LiveClassItem,
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
} from '../types/portal';

const TOKEN_STORAGE_KEY = 'il_session_token_v2';
const ADMIN_RETURN_TOKEN_KEY = 'il_admin_return_token_v1';

export function getSessionToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getAdminReturnToken(): string | null {
  try {
    return window.localStorage.getItem(ADMIN_RETURN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminReturnToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(ADMIN_RETURN_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(ADMIN_RETURN_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export interface AuthResponse {
  token: string;
  user: StudentProfile;
}

export const portalApi = {
  // Authentication
  sendOtp(phone: string, role: PortalRole) {
    return apiRequest<{ ok: boolean; phone: string; demoOtp: string }>('/api/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone, role }),
    });
  },
  verifyOtp(payload: {
    phone: string;
    otp: string;
    role: PortalRole;
    track: ExamTrack;
    name?: string;
    grade?: string;
  }) {
    return apiRequest<AuthResponse>('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  loginWithPassword(payload: {
    identifier: string;
    password: string;
    role: PortalRole;
    track?: ExamTrack;
  }) {
    return apiRequest<AuthResponse>('/api/auth/login/password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  loginWithId(payload: {
    admissionId: string;
    dobPin: string;
    role: PortalRole;
    track?: ExamTrack;
  }) {
    return apiRequest<AuthResponse>('/api/auth/login/id', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  register(payload: {
    name: string;
    email?: string;
    phone?: string;
    password: string;
    role: PortalRole;
    track: ExamTrack;
    grade: string;
  }) {
    return apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  demoLogin(role: PortalRole, track?: ExamTrack) {
    return apiRequest<AuthResponse>('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ role, track }),
    });
  },
  logout() {
    return apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  updateProfile(patch: Partial<StudentProfile>) {
    return apiRequest<{ user: StudentProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  // Workspace Hydration
  bootstrap() {
    return apiRequest<BackendBootstrapPayload>('/api/workspace/bootstrap');
  },

  // Student Mutations
  saveLessonProgress(lessonId: string, patch: { completed?: boolean; bookmarked?: boolean }) {
    return apiRequest<{ ok: boolean }>(`/api/lessons/${encodeURIComponent(lessonId)}/progress`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
  },
  saveDppProgress(dppId: string, completed: boolean, answers?: Record<string, number>) {
    return apiRequest<{ ok: boolean }>(`/api/dpp/${encodeURIComponent(dppId)}/progress`, {
      method: 'POST',
      body: JSON.stringify({ completed, answers }),
    });
  },
  toggleReminder(liveClassId: string, reminded: boolean) {
    return apiRequest<{ ok: boolean }>(`/api/live-classes/${encodeURIComponent(liveClassId)}/reminder`, {
      method: 'POST',
      body: JSON.stringify({ reminded }),
    });
  },
  getLiveChat(liveClassId: string) {
    return apiRequest<{ messages: Array<{ author: string; text: string }> }>(
      `/api/live-classes/${encodeURIComponent(liveClassId)}/chat`
    );
  },
  sendLiveChat(liveClassId: string, text: string) {
    return apiRequest<{ author: string; text: string }>(
      `/api/live-classes/${encodeURIComponent(liveClassId)}/chat`,
      {
        method: 'POST',
        body: JSON.stringify({ text }),
      }
    );
  },
  voteLivePoll(liveClassId: string, optionId: string) {
    return apiRequest<{ ok: boolean }>(`/api/live-classes/${encodeURIComponent(liveClassId)}/poll`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    });
  },
  submitTestAttempt(attempt: TestAttemptRecord) {
    return apiRequest<{ ok: boolean }>('/api/tests/attempts', {
      method: 'POST',
      body: JSON.stringify(attempt),
    });
  },
  removeErrorLogQuestion(questionId: string) {
    return apiRequest<{ ok: boolean }>(`/api/tests/error-log/${encodeURIComponent(questionId)}`, {
      method: 'DELETE',
    });
  },
  saveFlashcardProgress(
    flashcardId: string,
    patch: { status?: FlashcardStatus; bookmarked?: boolean }
  ) {
    return apiRequest<{ ok: boolean }>(
      `/api/flashcards/${encodeURIComponent(flashcardId)}/progress`,
      {
        method: 'POST',
        body: JSON.stringify(patch),
      }
    );
  },
  createTask(task: Omit<StudyTask, 'id'>) {
    return apiRequest<{ task: StudyTask }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  },
  toggleTask(taskId: string, completed: boolean) {
    return apiRequest<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    });
  },
  deleteTask(taskId: string) {
    return apiRequest<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });
  },
  saveDoubt(doubt: SavedDoubt) {
    return apiRequest<{ ok: boolean }>('/api/doubts', {
      method: 'POST',
      body: JSON.stringify(doubt),
    });
  },
  deleteDoubt(doubtId: string) {
    return apiRequest<{ ok: boolean }>(`/api/doubts/${encodeURIComponent(doubtId)}`, {
      method: 'DELETE',
    });
  },
  submitTicket(ticket: SupportTicket) {
    return apiRequest<{ ok: boolean }>('/api/support/tickets', {
      method: 'POST',
      body: JSON.stringify(ticket),
    });
  },

  // Teacher Console & Content Studio
  createTeacherClass(cls: LiveClassItem) {
    return apiRequest<{ ok: boolean }>('/api/teacher/classes', {
      method: 'POST',
      body: JSON.stringify(cls),
    });
  },
  createAssignment(payload: { title: string; subject: SubjectName; gradeLabel?: string }) {
    return apiRequest<{ assignment: TeacherAssignment }>('/api/teacher/assignments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateAssignmentStatus(id: string, status: 'Active' | 'Graded') {
    return apiRequest<{ ok: boolean }>(`/api/teacher/assignments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
  saveAttendance(roster: AttendanceStudent[]) {
    return apiRequest<{ ok: boolean }>('/api/teacher/attendance', {
      method: 'POST',
      body: JSON.stringify({ roster }),
    });
  },
  getContentStats() {
    return apiRequest<ContentStats>('/api/teacher/content/stats');
  },
  addChapterAndLesson(payload: {
    subject: SubjectName;
    title: string;
    unit: string;
    weightage: string;
    lessonTitle: string;
    lessonType: 'video' | 'notes' | 'practice';
    durationMin: number;
    summary: string;
    keyFormulas: string[];
    notesContent: string;
  }) {
    return apiRequest<{ ok: boolean; chapterId: string; lessonId: string }>(
      '/api/teacher/content/chapters',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
  addQuestion(q: Partial<QuestionItem>) {
    return apiRequest<{ ok: boolean; id: string }>('/api/teacher/content/questions', {
      method: 'POST',
      body: JSON.stringify(q),
    });
  },
  addNcertSolution(item: Partial<NcertSolutionItem>) {
    return apiRequest<{ ok: boolean; id: string }>('/api/teacher/content/ncert', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },
  addFlashcard(fc: Partial<FlashcardItem>) {
    return apiRequest<{ ok: boolean; id: string }>('/api/teacher/content/flashcards', {
      method: 'POST',
      body: JSON.stringify(fc),
    });
  },
  exportCurriculumJson() {
    return apiRequest<Record<string, unknown>>('/api/teacher/content/export');
  },
  importCurriculumJson(payload: Record<string, unknown>) {
    return apiRequest<{ ok: boolean; recordsUpserted: number }>('/api/teacher/content/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Institutional Admin Console (admin.infinitylearn.com)
  getAdminOverview() {
    return apiRequest<AdminOverviewPayload>('/api/admin/overview');
  },
  createAdminUser(payload: {
    name: string;
    email?: string;
    phone?: string;
    role: PortalRole;
    track: ExamTrack;
    programName?: string;
    grade?: string;
    password?: string;
    dobPin?: string;
    admissionId?: string;
    batchId?: string;
    campus?: string;
    subjects?: SubjectName[];
  }) {
    return apiRequest<{ ok: boolean; id: string; admissionId: string }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateAdminUser(
    id: string,
    patch: {
      role?: PortalRole;
      track?: ExamTrack;
      programName?: string;
      grade?: string;
      name?: string;
      batchId?: string | null;
      campus?: string;
      subjects?: SubjectName[];
      dailyGoalHours?: number;
    }
  ) {
    return apiRequest<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  resetUserCredentials(id: string, payload: { newPassword?: string; dobPin?: string }) {
    return apiRequest<{ ok: boolean }>(
      `/api/admin/users/${encodeURIComponent(id)}/reset-password`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
  deleteAdminUser(id: string) {
    return apiRequest<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  createBatch(payload: {
    code: string;
    name: string;
    track: ExamTrack;
    campus: string;
    leadFaculty: string;
    capacity: number;
    studentCount?: number;
    scheduleSlot: string;
    status?: BatchCohort['status'];
  }) {
    return apiRequest<{ ok: boolean; id: string }>('/api/admin/batches', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateBatch(
    id: string,
    patch: {
      status?: BatchCohort['status'];
      studentCount?: number;
      leadFaculty?: string;
      scheduleSlot?: string;
    }
  ) {
    return apiRequest<{ ok: boolean }>(`/api/admin/batches/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  deleteBatch(id: string) {
    return apiRequest<{ ok: boolean }>(`/api/admin/batches/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  createMockTest(payload: Partial<MockTestTemplate>) {
    return apiRequest<{ ok: boolean; id: string }>('/api/admin/mock-tests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateMockTest(id: string, patch: Partial<MockTestTemplate>) {
    return apiRequest<{ ok: boolean }>(`/api/admin/mock-tests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  cloneMockTest(id: string) {
    return apiRequest<{ ok: boolean; id: string }>(
      `/api/admin/mock-tests/${encodeURIComponent(id)}/clone`,
      { method: 'POST' }
    );
  },
  deleteMockTest(id: string) {
    return apiRequest<{ ok: boolean }>(`/api/admin/mock-tests/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  createDppSheet(payload: Partial<DppSheetItem>) {
    return apiRequest<{ ok: boolean; id: string }>('/api/admin/dpp-sheets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteContentEntity(
    entity: 'chapters' | 'questions' | 'dpp_sheets' | 'ncert_solutions' | 'flashcards' | 'live_classes',
    id: string
  ) {
    return apiRequest<{ ok: boolean }>(
      `/api/admin/content/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  },
  updateTicketStatus(id: string, status: 'Open' | 'Resolved') {
    return apiRequest<{ ok: boolean }>(`/api/admin/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
  getAdminAuditLogs() {
    return apiRequest<{ logs: AdminAuditLog[] }>('/api/admin/audit-logs');
  },

  // Admin 360° Drill-Down & Impersonation Endpoints
  getAdminStudents() {
    return apiRequest<{ students: AdminStudentSummary[] }>('/api/admin/students');
  },
  getAdminStudentDetail(id: string) {
    return apiRequest<AdminStudentDetailPayload>(`/api/admin/students/${encodeURIComponent(id)}`);
  },
  assignStudentTask(
    studentId: string,
    payload: { title: string; subject: SubjectName; day?: StudyTask['day']; durationMin?: number }
  ) {
    return apiRequest<{ ok: boolean; id: string }>(
      `/api/admin/students/${encodeURIComponent(studentId)}/assign-task`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
  overrideStudentLesson(
    studentId: string,
    lessonId: string,
    patch: { completed?: boolean; bookmarked?: boolean }
  ) {
    return apiRequest<{ ok: boolean }>(
      `/api/admin/students/${encodeURIComponent(studentId)}/lessons/${encodeURIComponent(lessonId)}`,
      {
        method: 'POST',
        body: JSON.stringify(patch),
      }
    );
  },
  clearStudentErrorLog(studentId: string, questionId: string) {
    return apiRequest<{ ok: boolean }>(
      `/api/admin/students/${encodeURIComponent(studentId)}/error-log/${encodeURIComponent(questionId)}`,
      { method: 'DELETE' }
    );
  },
  getAdminTeachers() {
    return apiRequest<{ teachers: AdminTeacherSummary[] }>('/api/admin/teachers');
  },
  getAdminTeacherDetail(id: string) {
    return apiRequest<AdminTeacherDetailPayload>(`/api/admin/teachers/${encodeURIComponent(id)}`);
  },
  scheduleFacultyClass(
    teacherId: string,
    payload: {
      title: string;
      subject: SubjectName;
      gradeLabel: string;
      dateLabel: string;
      timeRange: string;
      status: 'live' | 'upcoming' | 'recorded';
      track?: ExamTrack;
    }
  ) {
    return apiRequest<{ ok: boolean; id: string }>(
      `/api/admin/teachers/${encodeURIComponent(teacherId)}/classes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
  updateAdminLiveClass(
    classId: string,
    patch: {
      status?: 'live' | 'upcoming' | 'recorded';
      instructor?: string;
      timeRange?: string;
      dateLabel?: string;
      gradeLabel?: string;
    }
  ) {
    return apiRequest<{ ok: boolean }>(
      `/api/admin/live-classes/${encodeURIComponent(classId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
  },
  getAdminTests() {
    return apiRequest<{ tests: AdminTestSummary[] }>('/api/admin/tests');
  },
  getAdminTestDetail(id: string) {
    return apiRequest<AdminTestDetailPayload>(`/api/admin/tests/${encodeURIComponent(id)}`);
  },
  getAdminAttempts() {
    return apiRequest<{ attempts: AdminTestAttemptRow[] }>('/api/admin/attempts');
  },
  getAdminAttemptDetail(attemptId: string) {
    return apiRequest<AdminAttemptDetailPayload>(
      `/api/admin/attempts/${encodeURIComponent(attemptId)}`
    );
  },
  deleteAdminAttempt(attemptId: string) {
    return apiRequest<{ ok: boolean }>(`/api/admin/attempts/${encodeURIComponent(attemptId)}`, {
      method: 'DELETE',
    });
  },
  impersonateUser(userId: string) {
    return apiRequest<AuthResponse>(`/api/admin/impersonate/${encodeURIComponent(userId)}`, {
      method: 'POST',
    });
  },
  injectAdminData(payload: AdminInjectPayload) {
    return apiRequest<AdminInjectResult>('/api/admin/inject', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Security & Sessions
  getSessions() {
    return apiRequest<{ sessions: ActiveSessionInfo[] }>('/api/auth/sessions');
  },
  revokeSession(prefix: string) {
    return apiRequest<{ ok: boolean }>(`/api/auth/sessions/${encodeURIComponent(prefix)}`, {
      method: 'DELETE',
    });
  },
  resetPassword(payload: { identifier: string; newPassword?: string }) {
    return apiRequest<{ ok: boolean; message: string }>('/api/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Notifications & Gamification
  getNotifications() {
    return apiRequest<{ notifications: NotificationItem[] }>('/api/notifications');
  },
  markNotificationRead(id: string) {
    return apiRequest<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    });
  },
  markAllNotificationsRead() {
    return apiRequest<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' });
  },
  getGamification() {
    return apiRequest<GamificationSummary>('/api/gamification/me');
  },

  // Marketplace, Coupons & Checkout
  getMarketplaceCourses() {
    return apiRequest<{
      courses: CourseItem[];
      enrollments: EnrollmentItem[];
      orders: OrderRecord[];
    }>('/api/marketplace/courses');
  },
  validateCoupon(courseId: string, couponCode: string) {
    return apiRequest<{
      valid: boolean;
      code: string | null;
      discountInr: number;
      finalAmountInr: number;
      message: string;
    }>('/api/marketplace/validate-coupon', {
      method: 'POST',
      body: JSON.stringify({ courseId, couponCode }),
    });
  },
  checkoutCourse(payload: {
    courseId: string;
    couponCode?: string;
    paymentMethod: OrderRecord['paymentMethod'];
  }) {
    return apiRequest<{ ok: boolean; order: OrderRecord; enrollment: EnrollmentItem }>(
      '/api/marketplace/checkout',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  // Community Q&A, Mentorship & Scholarships
  getCommunityPosts() {
    return apiRequest<{ posts: CommunityPost[] }>('/api/community/posts');
  },
  createCommunityPost(payload: {
    subject: SubjectName;
    chapterTitle: string;
    title: string;
    body: string;
  }) {
    return apiRequest<{ post: CommunityPost }>('/api/community/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  replyToCommunityPost(postId: string, body: string) {
    return apiRequest<{ reply: CommunityReply }>(
      `/api/community/posts/${encodeURIComponent(postId)}/reply`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    );
  },
  upvoteCommunityPost(postId: string) {
    return apiRequest<{ ok: boolean; upvotes: number }>(
      `/api/community/posts/${encodeURIComponent(postId)}/upvote`,
      { method: 'POST' }
    );
  },
  updateCommunityPostStatus(postId: string, status: CommunityPost['status']) {
    return apiRequest<{ ok: boolean; status: CommunityPost['status'] }>(
      `/api/community/posts/${encodeURIComponent(postId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );
  },
  getMentorshipSessions() {
    return apiRequest<{ sessions: MentorshipSession[] }>('/api/mentorship/sessions');
  },
  bookMentorshipSession(payload: {
    mentorName: string;
    mentorRole?: string;
    topic: string;
    scheduledSlot: string;
    studentId?: string;
    studentName?: string;
  }) {
    return apiRequest<{ session: MentorshipSession }>('/api/mentorship/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getScholarships() {
    return apiRequest<{ scholarships: ScholarshipExam[] }>('/api/scholarships');
  },
  registerScholarship(id: string) {
    return apiRequest<{ ok: boolean; admitCardCode: string }>(
      `/api/scholarships/${encodeURIComponent(id)}/register`,
      { method: 'POST' }
    );
  },

  // Parent 360 Telemetry
  getParentDashboard() {
    return apiRequest<ParentDashboardPayload>('/api/parent/dashboard');
  },

  // AI Engines (Server-Side @google/genai)
  generateAiStudyPlan(payload: {
    studentName: string;
    track: ExamTrack;
    dailyGoalHours: number;
    weakTopics: string[];
    avgAccuracyPercent: number;
  }) {
    return apiRequest<{
      focusDiagnosis: string;
      weeklyStrategy: string;
      tasks: Array<{
        title: string;
        subject: SubjectName;
        day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
        durationMin: number;
      }>;
      provider: 'gemini' | 'offline-engine';
    }>('/api/ai/study-plan', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  generateAiPracticeQuestions(payload: {
    subject: SubjectName;
    topic: string;
    track: ExamTrack;
    difficulty: DifficultyLevel;
    count: number;
  }) {
    return apiRequest<{
      questions: Array<{
        subject: SubjectName;
        chapterTitle: string;
        difficulty: DifficultyLevel;
        prompt: string;
        options: [string, string, string, string];
        correctIndex: number;
        formulaUsed: string;
        explanation: string;
      }>;
      provider: 'gemini' | 'offline-engine';
    }>('/api/ai/generate-practice', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  generateAiLectureSummary(payload: { title: string; subject: string; notesContent: string }) {
    return apiRequest<{ summary: string; provider: 'gemini' | 'offline-engine' }>(
      '/api/ai/lecture-summary',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  // Super Admin Master Control, Commerce & DB Explorer
  getAdminConfig() {
    return apiRequest<{ config: PlatformConfig }>('/api/admin/config');
  },
  updateAdminConfig(patch: Partial<PlatformConfig>) {
    return apiRequest<{ ok: boolean; config: PlatformConfig }>('/api/admin/config', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  getAdminCommerce() {
    return apiRequest<AdminCommercePayload>('/api/admin/commerce');
  },
  createAdminCourse(course: Partial<CourseItem>) {
    return apiRequest<{ ok: boolean; id: string }>('/api/admin/courses', {
      method: 'POST',
      body: JSON.stringify(course),
    });
  },
  updateAdminCourse(id: string, patch: Partial<CourseItem>) {
    return apiRequest<{ ok: boolean }>(`/api/admin/courses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  deleteAdminCourse(id: string) {
    return apiRequest<{ ok: boolean }>(`/api/admin/courses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  upsertAdminCoupon(coupon: Partial<CouponItem>) {
    return apiRequest<{ ok: boolean; code: string }>('/api/admin/coupons', {
      method: 'POST',
      body: JSON.stringify(coupon),
    });
  },
  toggleAdminCoupon(code: string, active: boolean) {
    return apiRequest<{ ok: boolean }>(`/api/admin/coupons/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
  },
  refundAdminOrder(orderId: string) {
    return apiRequest<{ ok: boolean }>(`/api/admin/orders/${encodeURIComponent(orderId)}/refund`, {
      method: 'POST',
    });
  },
  grantAdminEnrollment(userId: string, courseId: string) {
    return apiRequest<{ ok: boolean; id: string }>('/api/admin/enrollments', {
      method: 'POST',
      body: JSON.stringify({ userId, courseId }),
    });
  },
  broadcastAdminNotification(payload: {
    title: string;
    body: string;
    category: NotificationItem['category'];
    userId?: string;
  }) {
    return apiRequest<{ ok: boolean; id: string }>('/api/admin/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getAdminSystemHealth() {
    return apiRequest<SystemHealthMetrics>('/api/admin/system-health');
  },
  revokeAdminSession(prefix: string) {
    return apiRequest<{ ok: boolean }>(`/api/admin/sessions/${encodeURIComponent(prefix)}`, {
      method: 'DELETE',
    });
  },
  getAdminTableRows(tableName: string) {
    return apiRequest<{ table: string; rows: Array<Record<string, unknown>> }>(
      `/api/admin/tables/${encodeURIComponent(tableName)}`
    );
  },
  deleteAdminTableRow(tableName: string, id: string) {
    return apiRequest<{ ok: boolean }>(
      `/api/admin/tables/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  },

  // Live Classroom Teaching Board & Session Workspace
  getLiveSessionWorkspace(classId: string) {
    return apiRequest<SessionWorkspacePayload>(
      `/api/live-classes/${encodeURIComponent(classId)}/workspace`
    );
  },
  saveLiveSessionBoard(classId: string, board: Partial<SessionBoardState>) {
    return apiRequest<{ ok: boolean; board: SessionBoardState }>(
      `/api/live-classes/${encodeURIComponent(classId)}/board`,
      {
        method: 'PUT',
        body: JSON.stringify(board),
      }
    );
  },
  createSessionMaterial(
    classId: string,
    payload: {
      category: 'note' | 'material';
      title: string;
      fileType: SessionMaterialItem['fileType'];
      summary: string;
      keyFormula?: string;
    }
  ) {
    return apiRequest<{ material: SessionMaterialItem }>(
      `/api/live-classes/${encodeURIComponent(classId)}/materials`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
  createSessionPoll(classId: string, payload: { prompt: string; options: string[] }) {
    return apiRequest<{ poll: SessionPollItem }>(
      `/api/live-classes/${encodeURIComponent(classId)}/polls`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
  voteSessionPoll(classId: string, pollId: string, optionId: string) {
    return apiRequest<{ poll: SessionPollItem }>(
      `/api/live-classes/${encodeURIComponent(classId)}/polls/${encodeURIComponent(pollId)}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({ optionId }),
      }
    );
  },
  createSessionQuiz(
    classId: string,
    payload: {
      title: string;
      prompt: string;
      options: [string, string, string, string];
      correctIndex: number;
      durationSec: number;
    }
  ) {
    return apiRequest<{ quiz: SessionQuizItem }>(
      `/api/live-classes/${encodeURIComponent(classId)}/quizzes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
  saveSessionClasswork(
    classId: string,
    payload: { title: string; slideTitle: string; imageDataUrl: string }
  ) {
    return apiRequest<{ classwork: SessionClassworkSnapshot }>(
      `/api/live-classes/${encodeURIComponent(classId)}/classwork`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
};
