import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  BarChart3,
  Bell,
  Bookmark,
  BookOpen,
  ChevronDown,
  CreditCard,
  Gift,
  Headphones,
  Home,
  Layers,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  User,
  Video,
  X,
} from 'lucide-react';
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
  PORTAL_IMAGES,
  QUESTION_BANK,
} from './data/curriculumData';
import type {
  AttendanceStudent,
  BackendBootstrapPayload,
  ChapterItem,
  DppSheetItem,
  EnrollmentItem,
  ExamTrack,
  FlashcardItem,
  FlashcardStatus,
  GamificationSummary,
  LeaderboardEntry,
  LiveClassItem,
  MockTestTemplate,
  NavSection,
  NcertSolutionItem,
  NotificationItem,
  PlatformConfig,
  PortalRole,
  QuestionItem,
  SavedDoubt,
  StudentProfile,
  StudyTask,
  SubjectName,
  SupportTicket,
  TeacherAssignment,
  TestAttemptRecord,
} from './types/portal';
import {
  getAdminReturnToken,
  getSessionToken,
  portalApi,
  setAdminReturnToken,
  setSessionToken,
} from './services/api';
import { LoginScreen } from './components/LoginScreen';
import { DashboardHome } from './components/DashboardHome';
import { CoursesModule } from './components/CoursesModule';
import { LiveClassesModule } from './components/LiveClassesModule';
import { TestsCyotModule } from './components/TestsCyotModule';
import { FlashcardsModule } from './components/FlashcardsModule';
import { AinaMentorModule } from './components/AinaMentorModule';
import { ScoreAnalyticsModule } from './components/ScoreAnalyticsModule';
import { PlannerBookmarksModule } from './components/PlannerBookmarksModule';
import { ProfileModal } from './components/ProfileModal';
import { TeacherPortalView } from './components/TeacherPortalView';
import { AdminPortalView } from './components/AdminPortalView';
import { ParentPortalView } from './components/ParentPortalView';
import { MarketplaceHubModule } from './components/MarketplaceHubModule';
import { CommunityForumModule } from './components/CommunityForumModule';
import {
  ContactUsView,
  ReferEarnView,
  SubscriptionsView,
} from './components/SupportModules';

const DARK_STORAGE_KEY = 'il_portal_dark_v2';

function readDarkPreference(): boolean {
  try {
    const raw = window.localStorage.getItem(DARK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as boolean) : false;
  } catch {
    return false;
  }
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => readDarkPreference());
  const [bootstrapping, setBootstrapping] = useState<boolean>(() => Boolean(getSessionToken()));
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [portalRole, setPortalRole] = useState<PortalRole>('student');
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const [chapters, setChapters] = useState<ChapterItem[]>(INITIAL_CHAPTERS);
  const [liveClasses, setLiveClasses] = useState<LiveClassItem[]>(INITIAL_LIVE_CLASSES);
  const [activeTheaterClass, setActiveTheaterClass] = useState<LiveClassItem | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>(QUESTION_BANK);
  const [mockTests, setMockTests] = useState<MockTestTemplate[]>(MOCK_TESTS);
  const [errorLogIds, setErrorLogIds] = useState<string[]>(['q-phy-2', 'q-chem-1', 'q-math-2']);
  const [dppSheets, setDppSheets] = useState<DppSheetItem[]>(INITIAL_DPP_SHEETS);
  const [ncertSolutions, setNcertSolutions] = useState<NcertSolutionItem[]>(NCERT_SOLUTIONS);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>(INITIAL_FLASHCARDS);
  const [testHistory, setTestHistory] = useState<TestAttemptRecord[]>(INITIAL_TEST_HISTORY);
  const [tasks, setTasks] = useState<StudyTask[]>(INITIAL_STUDY_TASKS);
  const [savedDoubts, setSavedDoubts] = useState<SavedDoubt[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(BATCH_LEADERBOARD);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>(
    INITIAL_TEACHER_ASSIGNMENTS
  );
  const [attendanceRoster, setAttendanceRoster] = useState<AttendanceStudent[]>(
    INITIAL_ATTENDANCE_ROSTER
  );
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [gamification, setGamification] = useState<GamificationSummary | null>(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [gamificationOpen, setGamificationOpen] = useState(false);

  // Secondary sub-tab inside Learn / Tests / Bookmarks
  const [showFlashcardsDrawer, setShowFlashcardsDrawer] = useState(false);

  // Cross-module prefill hooks
  const [preselectedSubject, setPreselectedSubject] = useState<SubjectName | null>(null);
  const [preselectedChapterId, setPreselectedChapterId] = useState<string | null>(null);
  const [prefillDoubt, setPrefillDoubt] = useState<{ subject: SubjectName; prompt: string } | null>(
    null
  );

  const applyBootstrapPayload = useCallback((payload: BackendBootstrapPayload) => {
    setStudent(payload.user);
    const resolvedRole: PortalRole =
      payload.user.role === 'admin'
        ? 'admin'
        : payload.user.role === 'teacher'
        ? 'teacher'
        : payload.user.role === 'parent'
        ? 'parent'
        : 'student';
    setPortalRole(resolvedRole);
    setChapters(payload.chapters);
    setLiveClasses(payload.liveClasses);
    setQuestions(payload.questions);
    setMockTests(payload.mockTests);
    setTestHistory(payload.testHistory);
    setErrorLogIds(payload.errorLogIds);
    setDppSheets(payload.dppSheets);
    setNcertSolutions(payload.ncertSolutions);
    setFlashcards(payload.flashcards);
    setTasks(payload.tasks);
    setSavedDoubts(payload.savedDoubts);
    setTickets(payload.tickets);
    setLeaderboard(payload.leaderboard);
    setTeacherAssignments(payload.teacherAssignments);
    setAttendanceRoster(payload.attendanceRoster);
    if (payload.platformConfig) setPlatformConfig(payload.platformConfig);
    if (payload.notifications) setNotifications(payload.notifications);
    if (payload.enrollments) setEnrollments(payload.enrollments);
    if (payload.gamification) setGamification(payload.gamification);
  }, []);

  const hydrateWorkspace = useCallback(async () => {
    if (!getSessionToken()) {
      setBootstrapping(false);
      return;
    }
    try {
      const payload = await portalApi.bootstrap();
      applyBootstrapPayload(payload);
    } catch {
      setSessionToken(null);
      setStudent(null);
    } finally {
      setBootstrapping(false);
    }
  }, [applyBootstrapPayload]);

  useEffect(() => {
    void hydrateWorkspace();
  }, [hydrateWorkspace]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(DARK_STORAGE_KEY, JSON.stringify(darkMode));
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  const handleUpdateProfile = (updated: StudentProfile) => {
    setStudent(updated);
    if (getSessionToken()) {
      portalApi.updateProfile(updated).catch(() => undefined);
    }
  };

  const handleLogout = () => {
    if (getSessionToken()) {
      portalApi.logout().catch(() => undefined);
    }
    setSessionToken(null);
    setAdminReturnToken(null);
    setPortalRole('student');
    setStudent(null);
    setActiveTheaterClass(null);
    setProfileModalOpen(false);
    setProfileMenuOpen(false);
  };

  const handleImpersonateUser = async (userId: string) => {
    const currentToken = getSessionToken();
    if (currentToken && !getAdminReturnToken()) {
      setAdminReturnToken(currentToken);
    }
    const res = await portalApi.impersonateUser(userId);
    setSessionToken(res.token);
    setStudent(res.user);
    const nextRole: PortalRole =
      res.user.role === 'admin'
        ? 'admin'
        : res.user.role === 'teacher'
        ? 'teacher'
        : res.user.role === 'parent'
        ? 'parent'
        : 'student';
    setPortalRole(nextRole);
    setActiveSection('dashboard');
    setActiveTheaterClass(null);
    await hydrateWorkspace();
  };

  const handleReturnToAdmin = async () => {
    const adminToken = getAdminReturnToken();
    if (!adminToken) return;
    setBootstrapping(true);
    setSessionToken(adminToken);
    setAdminReturnToken(null);
    setActiveTheaterClass(null);
    setActiveSection('dashboard');
    await hydrateWorkspace();
  };

  const handleToggleLessonComplete = (chapterId: string, lessonId: string) => {
    let nextCompleted = false;
    setChapters((prev) =>
      prev.map((ch) => {
        if (ch.id !== chapterId) return ch;
        const lessons = ch.lessons.map((l) => {
          if (l.id !== lessonId) return l;
          nextCompleted = !l.completed;
          return { ...l, completed: nextCompleted };
        });
        const doneCount = lessons.filter((l) => l.completed).length;
        const masteryPercent = Math.round((doneCount / lessons.length) * 100);
        return { ...ch, lessons, masteryPercent };
      })
    );
    if (getSessionToken()) {
      portalApi.saveLessonProgress(lessonId, { completed: nextCompleted }).catch(() => undefined);
    }
  };

  const handleToggleLessonBookmark = (chapterId: string, lessonId: string) => {
    let nextBookmarked = false;
    setChapters((prev) =>
      prev.map((ch) =>
        ch.id === chapterId
          ? {
              ...ch,
              lessons: ch.lessons.map((l) => {
                if (l.id !== lessonId) return l;
                nextBookmarked = !l.bookmarked;
                return { ...l, bookmarked: nextBookmarked };
              }),
            }
          : ch
      )
    );
    if (getSessionToken()) {
      portalApi.saveLessonProgress(lessonId, { bookmarked: nextBookmarked }).catch(() => undefined);
    }
  };

  const handleUpdateDpp = (
    dppId: string,
    completed: boolean,
    answers?: Record<string, number>
  ) => {
    setDppSheets((prev) =>
      prev.map((sheet) => (sheet.id === dppId ? { ...sheet, completed } : sheet))
    );
    if (getSessionToken()) {
      portalApi.saveDppProgress(dppId, completed, answers).catch(() => undefined);
    }
  };

  const handleToggleReminder = (liveId: string) => {
    let nextReminded = false;
    setLiveClasses((prev) =>
      prev.map((cls) => {
        if (cls.id !== liveId) return cls;
        nextReminded = !cls.reminded;
        return { ...cls, reminded: nextReminded };
      })
    );
    if (getSessionToken()) {
      portalApi.toggleReminder(liveId, nextReminded).catch(() => undefined);
    }
  };

  const handleUpdateFlashcardStatus = (id: string, status: FlashcardStatus) => {
    setFlashcards((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    if (getSessionToken()) {
      portalApi.saveFlashcardProgress(id, { status }).catch(() => undefined);
    }
  };

  const handleToggleFlashcardBookmark = (id: string) => {
    let nextBookmarked = false;
    setFlashcards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        nextBookmarked = !c.bookmarked;
        return { ...c, bookmarked: nextBookmarked };
      })
    );
    if (getSessionToken()) {
      portalApi.saveFlashcardProgress(id, { bookmarked: nextBookmarked }).catch(() => undefined);
    }
  };

  const handleCompleteTest = (attempt: TestAttemptRecord) => {
    setTestHistory((prev) => [...prev, attempt]);

    // Sync error log ids locally to match server calculation
    const newlyCorrectIds = new Set<string>();
    const newlyMissedIds = new Set<string>();
    (attempt.questionIds || []).forEach((qId) => {
      const q = questions.find((item) => item.id === qId);
      const ans = attempt.responses?.[qId];
      if (!q) return;
      if (ans === q.correctIndex) {
        newlyCorrectIds.add(qId);
      } else if (ans !== undefined && ans !== null) {
        newlyMissedIds.add(qId);
      }
    });
    setErrorLogIds((prev) => {
      const retained = prev.filter((id) => !newlyCorrectIds.has(id));
      newlyMissedIds.forEach((id) => {
        if (!retained.includes(id)) retained.unshift(id);
      });
      return retained;
    });

    if (getSessionToken()) {
      portalApi
        .submitTestAttempt(attempt)
        .then(() => hydrateWorkspace())
        .catch(() => undefined);
    }
  };

  const handleRemoveErrorLog = (questionId: string) => {
    setErrorLogIds((prev) => prev.filter((id) => id !== questionId));
    if (getSessionToken()) {
      portalApi.removeErrorLogQuestion(questionId).catch(() => undefined);
    }
  };

  const handleAddTask = (task: Omit<StudyTask, 'id'>) => {
    const tempId = `task-${Date.now()}`;
    setTasks((prev) => [{ ...task, id: tempId }, ...prev]);
    if (getSessionToken()) {
      portalApi
        .createTask(task)
        .then((res) => {
          if (res.task) {
            setTasks((prev) => prev.map((t) => (t.id === tempId ? res.task : t)));
          }
        })
        .catch(() => undefined);
    }
  };

  const handleToggleTask = (id: string) => {
    let nextCompleted = false;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        nextCompleted = !t.completed;
        return { ...t, completed: nextCompleted };
      })
    );
    if (getSessionToken()) {
      portalApi.toggleTask(id, nextCompleted).catch(() => undefined);
    }
  };

  const handleDeleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (getSessionToken()) {
      portalApi.deleteTask(id).catch(() => undefined);
    }
  };

  const handleSaveDoubt = (doubt: SavedDoubt) => {
    setSavedDoubts((prev) => [doubt, ...prev]);
    if (getSessionToken()) {
      portalApi.saveDoubt(doubt).catch(() => undefined);
    }
  };

  const handleDeleteDoubt = (id: string) => {
    setSavedDoubts((prev) => prev.filter((d) => d.id !== id));
    if (getSessionToken()) {
      portalApi.deleteDoubt(id).catch(() => undefined);
    }
  };

  const handleSubmitTicket = (ticket: SupportTicket) => {
    setTickets((prev) => [ticket, ...prev]);
    if (getSessionToken()) {
      portalApi.submitTicket(ticket).catch(() => undefined);
    }
  };

  const handleAskAina = (subject: SubjectName, prompt: string) => {
    setPrefillDoubt({ subject, prompt });
    setActiveSection('aina');
  };

  const handlePracticeChapter = (chapterId: string) => {
    setPreselectedChapterId(chapterId);
    setActiveSection('tests');
  };

  const handleSelectSubjectFromHome = (subject: SubjectName) => {
    setShowFlashcardsDrawer(false);
    setPreselectedSubject(subject);
    setActiveSection('courses');
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white px-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-blue-700 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-semibold">Loading your Ramu School workspace...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <LoginScreen
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onLoginSuccess={(profile) => {
          const initials = profile.name
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          const nextRole: PortalRole =
            profile.role === 'admin'
              ? 'admin'
              : profile.role === 'teacher'
              ? 'teacher'
              : profile.role === 'parent'
              ? 'parent'
              : 'student';
          setStudent({
            ...profile,
            initials:
              initials ||
              (nextRole === 'admin'
                ? 'RR'
                : nextRole === 'teacher'
                ? 'EM'
                : nextRole === 'parent'
                ? 'MS'
                : 'AS'),
            programName:
              profile.programName ||
              (profile.track === 'IIT-JEE'
                ? 'IIT-JEE 2027 Comprehensive Program'
                : profile.track === 'NEET UG'
                ? 'NEET UG 2027 Target Medical Program'
                : 'CBSE Grade 10 Science Full Program'),
            role: nextRole,
          });
          setPortalRole(nextRole);
          setActiveSection('dashboard');
          void hydrateWorkspace();
        }}
      />
    );
  }

  // Institutional Admin Console View
  if (portalRole === 'admin') {
    return (
      <AdminPortalView
        admin={student}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onSwitchToTeacher={() => setPortalRole('teacher')}
        onSwitchToStudent={() => setPortalRole('student')}
        onImpersonateUser={handleImpersonateUser}
        onRefreshWorkspace={hydrateWorkspace}
        onLogout={handleLogout}
      />
    );
  }

  const isShadowSession = Boolean(getAdminReturnToken());
  const shadowBanner = isShadowSession ? (
    <div className="bg-slate-900 dark:bg-slate-950 text-white border-b border-slate-800 px-4 sm:px-8 py-2 flex flex-wrap items-center justify-between gap-3 text-xs sticky top-0 z-50">
      <p className="font-medium truncate">
        Admin Shadow Mode · Viewing live {portalRole} workspace as{' '}
        <span className="font-bold">{student.name}</span> ({student.admissionId})
      </p>
      <button
        type="button"
        onClick={() => void handleReturnToAdmin()}
        className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer whitespace-nowrap shrink-0"
      >
        Return to Super Admin Console
      </button>
    </div>
  ) : null;

  // Parent Portal View
  if (portalRole === 'parent') {
    return (
      <>
        {shadowBanner}
        <ParentPortalView
          parent={student}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onSwitchToAdmin={student.role === 'admin' ? () => setPortalRole('admin') : undefined}
          onLogout={handleLogout}
        />
      </>
    );
  }

  // Teacher Portal View
  if (portalRole === 'teacher') {
    const facultyDisplayName =
      student.role === 'teacher' || student.role === 'admin' ? student.name : 'Ekansh Mishra';
    return (
      <>
        {shadowBanner}
        <TeacherPortalView
          facultyName={facultyDisplayName}
          facultyEmail={
            student.role === 'teacher' || student.role === 'admin'
              ? student.email
              : 'ekansh.mishra@teacher.infinitylearn.com'
          }
          facultyId={
            student.role === 'teacher' || student.role === 'admin'
              ? student.admissionId
              : 'SC-FAC-2026-118'
          }
          darkMode={darkMode}
          liveClasses={liveClasses}
          initialAssignments={teacherAssignments}
          initialRoster={attendanceRoster}
          onOpenSession={(cls) => {
            setActiveTheaterClass(cls);
            setPortalRole('student');
            setActiveSection('live');
          }}
          onCreateClass={(newCls) => setLiveClasses((prev) => [newCls, ...prev])}
          onRefreshWorkspace={hydrateWorkspace}
          onSwitchToStudent={() => setPortalRole('student')}
          onSwitchToAdmin={student.role === 'admin' ? () => setPortalRole('admin') : undefined}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onLogout={handleLogout}
        />
      </>
    );
  }

  const brandName = platformConfig?.institutionName || 'Ramu School';
  const unreadNotifs = notifications.filter((n) => !n.isRead).length;

  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    portalApi.markNotificationRead(id).catch(() => undefined);
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    portalApi.markAllNotificationsRead().catch(() => undefined);
  };

  const primaryNav: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'live', label: 'Live Classes', icon: Video },
    { id: 'courses', label: 'Learn', icon: BookOpen },
    { id: 'tests', label: 'Tests', icon: SlidersHorizontal },
    { id: 'aina', label: 'Doubts', icon: MessageSquareText },
  ];

  const secondaryNav: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    ...(platformConfig?.marketplaceEnabled !== false
      ? [{ id: 'marketplace' as NavSection, label: 'Courses & Store', icon: ShoppingBag }]
      : []),
    ...(platformConfig?.communityEnabled !== false
      ? [{ id: 'community' as NavSection, label: 'Community & Mentors', icon: MessageCircle }]
      : []),
    { id: 'bookmarks', label: 'My Bookmarks', icon: Bookmark },
    { id: 'analytics', label: 'SCORE Analytics', icon: BarChart3 },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  ];

  const supportNav: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'refer', label: 'Refer and Earn', icon: Gift },
    { id: 'contact', label: 'Contact Us', icon: Headphones },
  ];

  const renderSidebarButton = (item: {
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    return (
      <button
        key={item.id}
        type="button"
        title={sidebarMinimized ? item.label : undefined}
        onClick={() => {
          setShowFlashcardsDrawer(false);
          setActiveSection(item.id);
          setMobileMenuOpen(false);
        }}
        className={`w-full flex items-center ${
          sidebarMinimized ? 'justify-center px-2' : 'gap-3 px-4'
        } py-2.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
          isActive
            ? 'bg-white text-blue-700 font-semibold shadow-sm'
            : 'text-blue-50/90 hover:bg-white/15 hover:text-white'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!sidebarMinimized && <span>{item.label}</span>}
      </button>
    );
  };

  const activeNavLabel =
    [...primaryNav, ...secondaryNav, ...supportNav].find((n) => n.id === activeSection)?.label ||
    'Home';

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Signature Royal Blue Collapsible Sidebar (Screenshot 2: student.infinitylearn.com) */}
      <aside
        className={`hidden lg:flex lg:flex-col shrink-0 bg-[#0B63CE] dark:bg-slate-900 dark:border-r dark:border-slate-800 text-white sticky top-0 h-screen transition-all duration-200 ${
          sidebarMinimized ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand Header + Minimize Menu Control */}
        <div className="px-5 pt-5 pb-3 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('dashboard')}
              className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap cursor-pointer"
            >
              {sidebarMinimized ? 'RS' : brandName}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSidebarMinimized(!sidebarMinimized)}
            className={`w-full flex items-center ${
              sidebarMinimized ? 'justify-center' : 'justify-between'
            } px-2 py-1.5 rounded-lg text-xs font-medium text-blue-100 hover:bg-white/10 transition-colors cursor-pointer`}
          >
            {!sidebarMinimized && <span>Minimize Menu</span>}
            {sidebarMinimized ? (
              <PanelLeftOpen className="w-4 h-4 shrink-0" />
            ) : (
              <PanelLeftClose className="w-4 h-4 shrink-0" />
            )}
          </button>
        </div>

        {/* Navigation Groups */}
        <nav aria-label="Student portal navigation" className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="space-y-1">{primaryNav.map(renderSidebarButton)}</div>

          <div className="my-3 border-t border-white/15" />

          <div className="space-y-1">{secondaryNav.map(renderSidebarButton)}</div>

          <div className="my-3 border-t border-white/15" />

          <div className="space-y-1">{supportNav.map(renderSidebarButton)}</div>
        </nav>

        {/* Bottom Log Out */}
        <div className="p-3 border-t border-white/15">
          <button
            type="button"
            onClick={handleLogout}
            className={`w-full flex items-center ${
              sidebarMinimized ? 'justify-center px-2' : 'gap-3 px-4'
            } py-2.5 rounded-full text-sm font-medium text-blue-50 hover:bg-white/15 hover:text-white transition-colors cursor-pointer whitespace-nowrap`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarMinimized && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0B63CE] dark:bg-slate-900 text-white flex flex-col h-full z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-white/15">
              <span className="text-lg font-bold font-display">{brandName}</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {[...primaryNav, ...secondaryNav, ...supportNav].map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setShowFlashcardsDrawer(false);
                      setActiveSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium cursor-pointer ${
                      isActive
                        ? 'bg-white text-blue-700 font-semibold'
                        : 'text-blue-50 hover:bg-white/15'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-white/15">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium text-blue-50 hover:bg-white/15 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {shadowBanner}
        {/* Top Bar with Breadcrumbs + Notifications + XP + Flashcards + Profile */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
              <span className="hidden sm:inline font-semibold text-slate-800 dark:text-slate-200">
                {brandName}
              </span>
              <span className="hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {showFlashcardsDrawer ? 'Revision Flashcards' : activeNavLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 relative">
            {gamification && (
              <button
                type="button"
                onClick={() => {
                  setGamificationOpen(!gamificationOpen);
                  setNotifDrawerOpen(false);
                  setProfileMenuOpen(false);
                }}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer whitespace-nowrap tabular-nums"
              >
                <Award className="w-3.5 h-3.5" />
                <span>
                  Lvl {gamification.level} · {gamification.xpPoints} XP
                </span>
              </button>
            )}

            <button
              type="button"
              aria-label="Notifications"
              onClick={() => {
                setNotifDrawerOpen(!notifDrawerOpen);
                setGamificationOpen(false);
                setProfileMenuOpen(false);
              }}
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-slate-700 dark:text-slate-200" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowFlashcardsDrawer(!showFlashcardsDrawer);
                if (!showFlashcardsDrawer) setActiveSection('courses');
              }}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                showFlashcardsDrawer
                  ? 'border-blue-700 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-200'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Flashcards</span>
            </button>

            {notifDrawerOpen && (
              <div className="absolute right-0 top-12 w-80 max-w-[92vw] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-40 overflow-hidden text-xs">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white">
                    Notifications ({unreadNotifs} unread)
                  </span>
                  {unreadNotifs > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllNotificationsRead}
                      className="text-blue-700 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                  {notifications.length === 0 ? (
                    <p className="p-5 text-center text-slate-500 dark:text-slate-400">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleMarkNotificationRead(n.id)}
                        className={`w-full text-left p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer ${
                          n.isRead ? 'opacity-70' : 'bg-blue-50/40 dark:bg-blue-950/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {n.title}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">{n.category}</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                          {n.body}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {gamificationOpen && gamification && (
              <div className="absolute right-10 top-12 w-80 max-w-[92vw] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-40 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm text-slate-900 dark:text-white">
                      Level {gamification.level} · {gamification.levelTitle}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                      {gamification.xpPoints} XP · {gamification.streakDays}d streak
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGamificationOpen(false)}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (gamification.xpPoints / Math.max(1, gamification.nextLevelXp)) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {gamification.badges.map((b) => (
                    <div
                      key={b.id}
                      className={`p-2.5 rounded-xl border ${
                        b.earned
                          ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-800 opacity-60'
                      }`}
                    >
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {b.earned ? '✓ ' : ''}
                        {b.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {b.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Initials Dropdown Button (matching AS v in Screenshot 2) */}
            <button
              type="button"
              aria-label="Open user menu"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <span className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-center border border-amber-200 dark:border-amber-800">
                {student.initials || 'AS'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 top-12 w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-40 text-xs">
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white truncate">
                    {student.name}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 truncate font-mono text-[11px]">
                    {student.admissionId}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setProfileModalOpen(true);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>Profile & Daily Goals</span>
                </button>

                {student.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setPortalRole('admin');
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Switch to Admin Console</span>
                  </button>
                )}

                {(student.role === 'teacher' || student.role === 'admin') && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setPortalRole('teacher');
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                    <span>Switch to Teacher Portal</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setDarkMode(!darkMode);
                    setProfileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  {darkMode ? (
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>{darkMode ? 'Light Appearance' : 'Dark Appearance'}</span>
                </button>

                <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 font-semibold cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8">
          {showFlashcardsDrawer ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowFlashcardsDrawer(false)}
                  className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Back to {activeNavLabel}
                </button>
              </div>
              <FlashcardsModule
                flashcards={flashcards}
                onUpdateStatus={handleUpdateFlashcardStatus}
                onToggleBookmark={handleToggleFlashcardBookmark}
              />
            </div>
          ) : (
            <>
              {activeSection === 'dashboard' && (
                <DashboardHome
                  student={student}
                  chapters={chapters}
                  liveClasses={liveClasses}
                  testHistory={testHistory}
                  tasks={tasks}
                  gamification={gamification}
                  enrollments={enrollments}
                  onChangeProgram={(track: ExamTrack, programName: string, grade: string) =>
                    handleUpdateProfile({ ...student, track, programName, grade })
                  }
                  onNavigate={setActiveSection}
                  onSelectSubject={handleSelectSubjectFromHome}
                  onQuickDoubt={(q) => handleAskAina('Physics', q)}
                  onJoinLiveClass={(cls) => {
                    setActiveTheaterClass(cls);
                    setActiveSection('live');
                  }}
                  onToggleReminder={handleToggleReminder}
                  onToggleTask={handleToggleTask}
                  onAddTask={handleAddTask}
                />
              )}

              {activeSection === 'courses' && (
                <CoursesModule
                  chapters={chapters}
                  dppSheets={dppSheets}
                  ncertSolutions={ncertSolutions}
                  questions={questions}
                  preselectedSubject={preselectedSubject}
                  onClearPreselectedSubject={() => setPreselectedSubject(null)}
                  onToggleLessonComplete={handleToggleLessonComplete}
                  onToggleLessonBookmark={handleToggleLessonBookmark}
                  onUpdateDpp={handleUpdateDpp}
                  onAskAinaAboutLesson={handleAskAina}
                  onPracticeChapter={handlePracticeChapter}
                />
              )}

              {activeSection === 'live' && (
                <LiveClassesModule
                  liveClasses={liveClasses}
                  activeTheaterClass={activeTheaterClass}
                  onOpenTheater={setActiveTheaterClass}
                  onToggleReminder={handleToggleReminder}
                  userId={student.id}
                  userName={student.name}
                  userRole={portalRole}
                />
              )}

              {activeSection === 'tests' && (
                <TestsCyotModule
                  chapters={chapters}
                  questions={questions}
                  mockTests={mockTests}
                  errorLogIds={errorLogIds}
                  testHistory={testHistory}
                  studentTrack={student.track}
                  preselectedChapterId={preselectedChapterId}
                  onClearPreselectedChapter={() => setPreselectedChapterId(null)}
                  onCompleteTest={handleCompleteTest}
                  onRemoveErrorLog={handleRemoveErrorLog}
                  onAskAinaAboutQuestion={handleAskAina}
                />
              )}

              {activeSection === 'aina' && (
                <AinaMentorModule
                  track={student.track}
                  savedDoubts={savedDoubts}
                  prefillDoubt={prefillDoubt}
                  onClearPrefill={() => setPrefillDoubt(null)}
                  onSaveDoubt={handleSaveDoubt}
                  onDeleteDoubt={handleDeleteDoubt}
                />
              )}

              {activeSection === 'marketplace' && (
                <MarketplaceHubModule
                  studentTrack={student.track}
                  onRefreshWorkspace={hydrateWorkspace}
                />
              )}

              {activeSection === 'community' && (
                <CommunityForumModule userRole={student.role} />
              )}

              {activeSection === 'bookmarks' && (
                <PlannerBookmarksModule
                  tasks={tasks}
                  chapters={chapters}
                  flashcards={flashcards}
                  onAddTask={handleAddTask}
                  onToggleTask={handleToggleTask}
                  onDeleteTask={handleDeleteTask}
                  onNavigate={(sec) => {
                    setShowFlashcardsDrawer(false);
                    setActiveSection(sec);
                  }}
                  onOpenFlashcards={() => setShowFlashcardsDrawer(true)}
                />
              )}

              {activeSection === 'analytics' && (
                <ScoreAnalyticsModule
                  student={student}
                  chapters={chapters}
                  testHistory={testHistory}
                  leaderboard={leaderboard}
                  onPracticeWeakChapter={handlePracticeChapter}
                />
              )}

              {activeSection === 'subscriptions' && (
                <SubscriptionsView
                  student={student}
                  onUpgradePlan={(programName) =>
                    handleUpdateProfile({ ...student, programName })
                  }
                />
              )}

              {activeSection === 'refer' && <ReferEarnView student={student} />}

              {activeSection === 'contact' && (
                <ContactUsView
                  student={student}
                  tickets={tickets}
                  onSubmitTicket={handleSubmitTicket}
                />
              )}
            </>
          )}
        </main>

        {/* Floating AINA Mentor Quick-Launch Button (matching bottom-right avatar in Screenshot 2) */}
        {activeSection !== 'aina' && (
          <button
            type="button"
            aria-label="Open AINA Doubt Solver"
            onClick={() => {
              setShowFlashcardsDrawer(false);
              setActiveSection('aina');
            }}
            className="fixed bottom-5 right-5 z-30 flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg hover:border-blue-600 transition-colors cursor-pointer"
          >
            <img
              src={PORTAL_IMAGES.mentorChemistry}
              alt="AINA Academic Mentor"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover"
            />
            <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
              Ask AINA
            </span>
          </button>
        )}
      </div>

      {/* Profile & Account Modal */}
      {profileModalOpen && (
        <ProfileModal
          student={student}
          onClose={() => setProfileModalOpen(false)}
          onSaveProfile={handleUpdateProfile}
          onSignOut={handleLogout}
        />
      )}
    </div>
  );
}
