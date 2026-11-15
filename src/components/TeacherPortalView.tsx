import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Database,
  Download,
  Home,
  Info,
  Loader2,
  LogOut,
  MessageCircle,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Upload,
  User,
  Users,
  Video,
  X,
} from 'lucide-react';
import type {
  AttendanceStudent,
  ContentStats,
  DifficultyLevel,
  ExamTrack,
  LiveClassItem,
  SubjectName,
  TeacherAssignment,
} from '../types/portal';
import {
  INITIAL_ATTENDANCE_ROSTER,
  INITIAL_TEACHER_ASSIGNMENTS,
  PORTAL_IMAGES,
} from '../data/curriculumData';
import { portalApi } from '../services/api';
import { CommunityForumModule } from './CommunityForumModule';
import { TeacherSessionDetailView } from './TeacherSessionDetailView';

interface TeacherPortalViewProps {
  facultyName: string;
  facultyEmail: string;
  facultyId: string;
  darkMode: boolean;
  liveClasses: LiveClassItem[];
  initialAssignments?: TeacherAssignment[];
  initialRoster?: AttendanceStudent[];
  onOpenSession: (cls: LiveClassItem) => void;
  onCreateClass: (newClass: LiveClassItem) => void;
  onRefreshWorkspace?: () => Promise<void> | void;
  onSwitchToStudent: () => void;
  onSwitchToAdmin?: () => void;
  onToggleDarkMode: () => void;
  onLogout: () => void;
}

export const TeacherPortalView: React.FC<TeacherPortalViewProps> = ({
  facultyName,
  facultyEmail,
  facultyId,
  darkMode,
  liveClasses,
  initialAssignments,
  initialRoster,
  onOpenSession,
  onCreateClass,
  onRefreshWorkspace,
  onSwitchToStudent,
  onSwitchToAdmin,
  onToggleDarkMode,
  onLogout,
}) => {
  const [sidebarTab, setSidebarTab] = useState<
    'home' | 'classes' | 'assignments' | 'attendance' | 'content' | 'community'
  >('home');
  const [classTab, setClassTab] = useState<'upcoming' | 'past'>('upcoming');
  const [showAll, setShowAll] = useState(false);
  const [selectedSession, setSelectedSession] = useState<LiveClassItem | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Schedule form state
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<SubjectName>('Physics');
  const [gradeLabel, setGradeLabel] = useState('Grade 10');
  const [timeRange, setTimeRange] = useState('7:00 pm – 7:55 pm');

  // Assignments & Attendance state
  const [assignments, setAssignments] = useState<TeacherAssignment[]>(
    initialAssignments && initialAssignments.length > 0
      ? initialAssignments
      : INITIAL_TEACHER_ASSIGNMENTS
  );
  const [newAsgTitle, setNewAsgTitle] = useState('');
  const [newAsgSubject, setNewAsgSubject] = useState<SubjectName>('Physics');
  const [roster, setRoster] = useState<AttendanceStudent[]>(
    initialRoster && initialRoster.length > 0 ? initialRoster : INITIAL_ATTENDANCE_ROSTER
  );
  const [attendanceSaved, setAttendanceSaved] = useState(false);

  // Backend Content & Data Studio state
  const [contentStats, setContentStats] = useState<ContentStats | null>(null);
  const [studioTab, setStudioTab] = useState<'chapter' | 'question' | 'ncert' | 'import'>('chapter');
  const [studioNotice, setStudioNotice] = useState('');

  // Chapter + Lesson form
  const [chSubject, setChSubject] = useState<SubjectName>('Physics');
  const [chTitle, setChTitle] = useState('');
  const [chUnit, setChUnit] = useState('Unit 1 · Core Syllabus');
  const [chWeightage, setChWeightage] = useState('8% Exam Weightage');
  const [lesTitle, setLesTitle] = useState('');
  const [lesSummary, setLesSummary] = useState('');
  const [lesFormula, setLesFormula] = useState('');

  // Question form
  const [qSubject, setQSubject] = useState<SubjectName>('Physics');
  const [qChapterTitle, setQChapterTitle] = useState('Magnetic Effects of Electric Current');
  const [qDifficulty, setQDifficulty] = useState<DifficultyLevel>('Moderate');
  const [qPrompt, setQPrompt] = useState('');
  const [qOptA, setQOptA] = useState('');
  const [qOptB, setQOptB] = useState('');
  const [qOptC, setQOptC] = useState('');
  const [qOptD, setQOptD] = useState('');
  const [qCorrectIdx, setQCorrectIdx] = useState(0);
  const [qFormula, setQFormula] = useState('');
  const [qExplanation, setQExplanation] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiGeneratingQ, setAiGeneratingQ] = useState(false);

  // NCERT form
  const [ncSubject, setNcSubject] = useState<SubjectName>('Physics');
  const [ncChapter, setNcChapter] = useState('');
  const [ncRef, setNcRef] = useState('NCERT Ex Q1');
  const [ncQuestion, setNcQuestion] = useState('');
  const [ncStepsText, setNcStepsText] = useState('');
  const [ncFinalAns, setNcFinalAns] = useState('');

  // Bulk JSON import textarea
  const [bulkJsonText, setBulkJsonText] = useState('');

  const loadContentStats = async () => {
    try {
      const stats = await portalApi.getContentStats();
      setContentStats(stats);
    } catch {
      // ignore if not authenticated as teacher
    }
  };

  useEffect(() => {
    if (sidebarTab === 'content') {
      loadContentStats();
    }
  }, [sidebarTab]);

  const upcomingList = liveClasses.filter(
    (c) => c.status === 'live' || c.status === 'upcoming'
  );
  const pastList = liveClasses.filter((c) => c.status === 'recorded');
  const activeList = showAll
    ? liveClasses
    : classTab === 'upcoming'
    ? upcomingList
    : pastList;

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const newCls: LiveClassItem = {
      id: `live-${Date.now()}`,
      title: title.trim(),
      subject,
      instructor: facultyName,
      instructorRole: 'Faculty · Sri Chaitanya Educational Institutions',
      instructorAvatar: PORTAL_IMAGES.mentorPhysics,
      status: 'upcoming',
      scheduledTime: `Starts Today · ${timeRange}`,
      dateLabel: 'Today',
      timeRange,
      gradeLabel,
      language: 'ENGLISH',
      track: 'CBSE Grade 10' as ExamTrack,
      chapter: title.trim(),
      reminded: false,
      attendeesCount: 120,
      whiteboardNotes: [
        `Session Outline: ${title.trim()}`,
        'Interactive problem-solving & live concept poll.',
      ],
      pollQuestion: {
        prompt: `Quick Readiness Check for ${title.trim()}:`,
        options: [
          { id: 'a', label: 'Ready with NCERT basics', votes: 42 },
          { id: 'b', label: 'Need quick formula recap first', votes: 28 },
        ],
      },
    };
    onCreateClass(newCls);
    try {
      await portalApi.createTeacherClass(newCls);
    } catch {
      // handled gracefully
    }
    setTitle('');
    setScheduleOpen(false);
    setSidebarTab('classes');
    setClassTab('upcoming');
  };

  const handlePublishAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAsgTitle.trim()) return;
    try {
      const res = await portalApi.createAssignment({
        title: newAsgTitle.trim(),
        subject: newAsgSubject,
        gradeLabel: 'Grade 10',
      });
      setAssignments((prev) => [res.assignment, ...prev]);
    } catch {
      setAssignments((prev) => [
        {
          id: `asg-${Date.now()}`,
          title: newAsgTitle.trim(),
          subject: newAsgSubject,
          gradeLabel: 'Grade 10',
          dueDate: 'Tomorrow · 9:00 PM',
          submittedCount: 0,
          totalStudents: roster.length,
          status: 'Active',
        },
        ...prev,
      ]);
    }
    setNewAsgTitle('');
  };

  const handleToggleAssignmentStatus = async (asg: TeacherAssignment) => {
    const nextStatus = asg.status === 'Active' ? 'Graded' : 'Active';
    setAssignments((prev) =>
      prev.map((a) => (a.id === asg.id ? { ...a, status: nextStatus } : a))
    );
    try {
      await portalApi.updateAssignmentStatus(asg.id, nextStatus);
    } catch {
      // ignore offline error
    }
  };

  const setStudentAttendance = (id: string, status: AttendanceStudent['status']) => {
    setAttendanceSaved(false);
    setRoster((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const handleSaveAttendance = async () => {
    try {
      await portalApi.saveAttendance(roster);
    } catch {
      // ignore offline error
    }
    setAttendanceSaved(true);
  };

  const handleAiFillQuestion = async () => {
    setAiGeneratingQ(true);
    setStudioNotice('');
    try {
      const res = await portalApi.generateAiPracticeQuestions({
        subject: qSubject,
        topic: aiTopic.trim() || qChapterTitle.trim() || qSubject,
        track: 'IIT-JEE',
        difficulty: qDifficulty,
        count: 1,
      });
      const first = res.questions[0];
      if (first) {
        setQPrompt(first.prompt);
        setQOptA(first.options[0] || '');
        setQOptB(first.options[1] || '');
        setQOptC(first.options[2] || '');
        setQOptD(first.options[3] || '');
        setQCorrectIdx(first.correctIndex ?? 0);
        setQFormula(first.formulaUsed || '');
        setQExplanation(first.explanation || '');
        setStudioNotice(
          `Drafted ${qSubject} MCQ via ${res.provider === 'gemini' ? 'Gemini AI' : 'Offline Engine'}. Review & save to bank.`
        );
      }
    } catch (err) {
      setStudioNotice(
        err instanceof Error ? err.message : 'Unable to auto-generate question right now.'
      );
    } finally {
      setAiGeneratingQ(false);
    }
  };

  const handleAddChapterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioNotice('');
    try {
      await portalApi.addChapterAndLesson({
        subject: chSubject,
        title: chTitle,
        unit: chUnit,
        weightage: chWeightage,
        lessonTitle: lesTitle,
        lessonType: 'video',
        durationMin: 35,
        summary: lesSummary,
        keyFormulas: lesFormula ? [lesFormula] : [],
        notesContent: lesSummary || lesTitle,
      });
      setChTitle('');
      setLesTitle('');
      setLesSummary('');
      setLesFormula('');
      setStudioNotice('Chapter and initial lesson saved to SQLite database.');
      await loadContentStats();
      await onRefreshWorkspace?.();
    } catch (err) {
      setStudioNotice(err instanceof Error ? err.message : 'Unable to save chapter.');
    }
  };

  const handleAddQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioNotice('');
    try {
      await portalApi.addQuestion({
        subject: qSubject,
        chapterId: `${qSubject.toLowerCase().slice(0, 4)}-custom`,
        chapterTitle: qChapterTitle,
        difficulty: qDifficulty,
        prompt: qPrompt,
        options: [qOptA, qOptB, qOptC, qOptD],
        correctIndex: qCorrectIdx,
        formulaUsed: qFormula,
        explanation: qExplanation,
      });
      setQPrompt('');
      setQOptA('');
      setQOptB('');
      setQOptC('');
      setQOptD('');
      setQFormula('');
      setQExplanation('');
      setStudioNotice('Question added to SQLite bank — immediately live in CYOT & DPPs.');
      await loadContentStats();
      await onRefreshWorkspace?.();
    } catch (err) {
      setStudioNotice(err instanceof Error ? err.message : 'Unable to save question.');
    }
  };

  const handleAddNcertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioNotice('');
    try {
      await portalApi.addNcertSolution({
        subject: ncSubject,
        chapter: ncChapter,
        exerciseRef: ncRef,
        question: ncQuestion,
        solutionSteps: ncStepsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        finalAnswer: ncFinalAns,
      });
      setNcChapter('');
      setNcQuestion('');
      setNcStepsText('');
      setNcFinalAns('');
      setStudioNotice('NCERT solution saved to SQLite database.');
      await loadContentStats();
      await onRefreshWorkspace?.();
    } catch (err) {
      setStudioNotice(err instanceof Error ? err.message : 'Unable to save NCERT solution.');
    }
  };

  const handleExportTemplate = async () => {
    try {
      const data = await portalApi.exportCurriculumJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'infinity-learn-curriculum-schema.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStudioNotice('Exported full SQLite curriculum JSON template.');
    } catch (err) {
      setStudioNotice(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioNotice('');
    try {
      const parsed = JSON.parse(bulkJsonText) as Record<string, unknown>;
      const res = await portalApi.importCurriculumJson(parsed);
      setStudioNotice(`Successfully imported/updated ${res.recordsUpserted} records into SQLite.`);
      setBulkJsonText('');
      await loadContentStats();
      await onRefreshWorkspace?.();
    } catch (err) {
      setStudioNotice(err instanceof Error ? err.message : 'Invalid JSON format or import failed.');
    }
  };

  const presentCount = roster.filter((r) => r.status === 'Present' || r.status === 'Late').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Bar matching Screenshot 3 (Infinity Learn by Sri Chaitanya) */}
      <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-slate-900 dark:text-white font-display whitespace-nowrap">
            Ramu School
          </span>
          <span className="hidden sm:inline text-xs font-semibold text-rose-700 dark:text-rose-400 pl-4 border-l border-slate-200 dark:border-slate-700 whitespace-nowrap">
            Faculty Teaching Console
          </span>
        </div>

        <div className="flex items-center gap-3 relative">
          <button
            type="button"
            onClick={() => setScheduleOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Class</span>
          </button>

          {onSwitchToAdmin && (
            <button
              type="button"
              onClick={onSwitchToAdmin}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Admin Console</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSwitchToStudent}
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Student Portal</span>
          </button>

          {/* Faculty Profile Dropdown matching Screenshot 3 top-right avatar v */}
          <button
            type="button"
            aria-label="Open faculty menu"
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="inline-flex items-center gap-1.5 p-1 pr-2 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center">
              <User className="w-3.5 h-3.5" />
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 top-12 w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-40 text-xs">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
                <p className="font-bold text-slate-900 dark:text-white truncate">{facultyName}</p>
                <p className="text-slate-500 dark:text-slate-400 truncate font-mono text-[11px]">
                  {facultyId} · {facultyEmail}
                </p>
              </div>

              {onSwitchToAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onSwitchToAdmin();
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Switch to Admin Console</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  onSwitchToStudent();
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                <span>Switch to Student Portal</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onToggleDarkMode();
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
                onClick={() => {
                  setProfileMenuOpen(false);
                  onLogout();
                }}
                className="w-full text-left px-4 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 font-semibold cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Faculty Sidebar (Home / My Classes / Assignments / Attendance) */}
        <aside className="lg:col-span-3">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-1">
            {([
              { id: 'home', label: 'Home', icon: Home },
              { id: 'classes', label: 'My Classes', icon: Video },
              { id: 'assignments', label: 'Assignments & DPP', icon: ClipboardList },
              { id: 'attendance', label: 'Batch Attendance', icon: Users },
              { id: 'content', label: 'Content & Data Studio', icon: Database },
              { id: 'community', label: 'Community & Doubts', icon: MessageCircle },
            ] as const).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedSession(null);
                    setSidebarTab(item.id);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                    sidebarTab === item.id
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Faculty Viewport */}
        <main className="lg:col-span-9 space-y-6">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Teacher Portal · Faculty Console
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display mt-0.5">
              Hello {facultyName.toUpperCase()}
            </h1>
          </div>

          {(sidebarTab === 'home' || sidebarTab === 'classes') && selectedSession ? (
            <TeacherSessionDetailView
              liveClass={selectedSession}
              facultyId={facultyId}
              facultyName={facultyName}
              assignments={assignments}
              onBack={() => setSelectedSession(null)}
            />
          ) : (sidebarTab === 'home' || sidebarTab === 'classes') ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-6">
                  <button
                    type="button"
                    onClick={() => {
                      setClassTab('upcoming');
                      setShowAll(false);
                    }}
                    className={`text-sm font-bold pb-3 -mb-3.5 border-b-2 transition-colors cursor-pointer ${
                      !showAll && classTab === 'upcoming'
                        ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    My Upcoming Classes ({upcomingList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setClassTab('past');
                      setShowAll(false);
                    }}
                    className={`text-sm font-bold pb-3 -mb-3.5 border-b-2 transition-colors cursor-pointer ${
                      !showAll && classTab === 'past'
                        ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    My Past Classes ({pastList.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  {showAll ? 'FILTER BY TAB' : 'VIEW ALL'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {activeList.map((cls) => (
                  <article
                    key={cls.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-between"
                  >
                    <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                          {cls.subject}
                        </span>
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          {cls.status === 'live'
                            ? 'LIVE NOW'
                            : cls.status === 'upcoming'
                            ? cls.dateLabel.toUpperCase()
                            : 'COMPLETED'}
                        </span>
                      </div>

                      <h2 className="text-base font-bold text-slate-900 dark:text-white font-display leading-snug">
                        {cls.title}
                      </h2>

                      <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          ONLINE
                        </span>
                        <span aria-hidden="true">|</span>
                        <span>{cls.gradeLabel}</span>
                        <span aria-hidden="true">|</span>
                        <span>{cls.language}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {cls.dateLabel} · {cls.timeRange}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSession(cls);
                          if (cls.id === '__external_redirect__') onOpenSession(cls);
                        }}
                        className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold tracking-wide cursor-pointer"
                      >
                        VIEW SESSION
                      </button>
                    </div>

                    <div className="px-5 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200/70 dark:border-amber-900/50 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <Info className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                      <span>Interactive Live Class</span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {sidebarTab === 'assignments' && (
            <section className="space-y-5">
              <form
                onSubmit={handlePublishAssignment}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row gap-3"
              >
                <input
                  type="text"
                  value={newAsgTitle}
                  onChange={(e) => setNewAsgTitle(e.target.value)}
                  placeholder="Publish new DPP or homework (e.g., Solenoid Numericals Set-2)"
                  className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <select
                  value={newAsgSubject}
                  onChange={(e) => setNewAsgSubject(e.target.value as SubjectName)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option>Physics</option>
                  <option>Chemistry</option>
                  <option>Mathematics</option>
                  <option>Biology</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  Assign DPP
                </button>
              </form>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {assignments.map((asg) => (
                  <div
                    key={asg.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                        {asg.subject} · {asg.gradeLabel} · {asg.dueDate}
                      </p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        {asg.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs tabular-nums">
                      <span className="font-mono font-semibold">
                        {asg.submittedCount}/{asg.totalStudents} Submitted
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleAssignmentStatus(asg)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {asg.status === 'Graded' ? 'Graded' : 'Mark Graded'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sidebarTab === 'attendance' && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold font-display">
                    Batch Attendance · Magnetic Effects of Electric Current
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                    Present/Late: {presentCount} of {roster.length} students (
                    {Math.round((presentCount / roster.length) * 100)}%)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveAttendance}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{attendanceSaved ? 'Attendance Saved to DB' : 'Save Roll Call'}</span>
                </button>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {roster.map((stu) => (
                  <div
                    key={stu.id}
                    className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {stu.name}
                      </p>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {stu.rollNo}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(['Present', 'Late', 'Absent'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStudentAttendance(stu.id, st)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                            stu.status === st
                              ? st === 'Present'
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : st === 'Late'
                                ? 'border-amber-500 bg-amber-500 text-white'
                                : 'border-rose-600 bg-rose-600 text-white'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sidebarTab === 'content' && (
            <section className="space-y-6">
              {/* Live Backend Database Space Overview */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white">
                      Content & Data Architecture Studio
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Engine: {contentStats?.databaseEngine || 'SQLite (node:sqlite WAL)'} · Add chapters, questions, NCERT solutions, or bulk-import JSON curriculum later.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportTemplate}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON Schema Template</span>
                  </button>
                </div>

                {contentStats && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2.5 pt-2 tabular-nums">
                    {(
                      [
                        ['Users', contentStats.counts.users],
                        ['Chapters', contentStats.counts.chapters],
                        ['Lessons', contentStats.counts.lessons],
                        ['Questions', contentStats.counts.questions],
                        ['DPPs', contentStats.counts.dppSheets],
                        ['NCERT', contentStats.counts.ncertSolutions],
                        ['Mocks', contentStats.counts.mockTests],
                        ['Cards', contentStats.counts.flashcards],
                        ['Live', contentStats.counts.liveClasses],
                      ] as const
                    ).map(([label, val]) => (
                      <div
                        key={label}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center"
                      >
                        <p className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                          {val}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {studioNotice && (
                  <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    {studioNotice}
                  </div>
                )}
              </div>

              {/* Authoring Mode Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit max-w-full overflow-x-auto">
                {([
                  { id: 'chapter', label: 'Add Chapter & Lesson' },
                  { id: 'question', label: 'Add CYOT/Mock Question' },
                  { id: 'ncert', label: 'Add NCERT Solution' },
                  { id: 'import', label: 'Bulk JSON Import' },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setStudioTab(t.id)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                      studioTab === t.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {studioTab === 'chapter' && (
                <form
                  onSubmit={handleAddChapterSubmit}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">Subject</label>
                      <select
                        value={chSubject}
                        onChange={(e) => setChSubject(e.target.value as SubjectName)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option>Physics</option>
                        <option>Chemistry</option>
                        <option>Mathematics</option>
                        <option>Biology</option>
                        <option>English</option>
                        <option>Vedic Mathematics</option>
                        <option>Social Science</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Unit</label>
                      <input
                        type="text"
                        value={chUnit}
                        onChange={(e) => setChUnit(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Weightage</label>
                      <input
                        type="text"
                        value={chWeightage}
                        onChange={(e) => setChWeightage(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">Chapter Title</label>
                      <input
                        type="text"
                        required
                        value={chTitle}
                        onChange={(e) => setChTitle(e.target.value)}
                        placeholder="e.g., Ray Optics & Optical Instruments"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Initial Lesson Title</label>
                      <input
                        type="text"
                        required
                        value={lesTitle}
                        onChange={(e) => setLesTitle(e.target.value)}
                        placeholder="e.g., Snell's Law, Total Internal Reflection & Prisms"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">Key Formula</label>
                      <input
                        type="text"
                        value={lesFormula}
                        onChange={(e) => setLesFormula(e.target.value)}
                        placeholder="e.g., n₁ sin θ₁ = n₂ sin θ₂"
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Summary</label>
                      <input
                        type="text"
                        value={lesSummary}
                        onChange={(e) => setLesSummary(e.target.value)}
                        placeholder="Brief topic overview..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Save Chapter to SQLite
                    </button>
                  </div>
                </form>
              )}

              {studioTab === 'question' && (
                <form
                  onSubmit={handleAddQuestionSubmit}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                >
                  <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <input
                      type="text"
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder="AI MCQ Draft Topic (e.g., Biot-Savart Law)"
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      disabled={aiGeneratingQ}
                      onClick={() => void handleAiFillQuestion()}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      {aiGeneratingQ ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{aiGeneratingQ ? 'Drafting...' : 'Generate MCQ with AI'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">Subject</label>
                      <select
                        value={qSubject}
                        onChange={(e) => setQSubject(e.target.value as SubjectName)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option>Physics</option>
                        <option>Chemistry</option>
                        <option>Mathematics</option>
                        <option>Biology</option>
                        <option>English</option>
                        <option>Vedic Mathematics</option>
                        <option>Social Science</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Chapter Title</label>
                      <input
                        type="text"
                        required
                        value={qChapterTitle}
                        onChange={(e) => setQChapterTitle(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Difficulty</label>
                      <select
                        value={qDifficulty}
                        onChange={(e) => setQDifficulty(e.target.value as DifficultyLevel)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="Foundation">Foundation</option>
                        <option value="Moderate">Moderate</option>
                        <option value="Advanced">Advanced</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Question Prompt</label>
                    <textarea
                      rows={2}
                      required
                      value={qPrompt}
                      onChange={(e) => setQPrompt(e.target.value)}
                      placeholder="Enter the MCQ problem statement..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      value={qOptA}
                      onChange={(e) => setQOptA(e.target.value)}
                      placeholder="Option A"
                      className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      required
                      value={qOptB}
                      onChange={(e) => setQOptB(e.target.value)}
                      placeholder="Option B"
                      className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      required
                      value={qOptC}
                      onChange={(e) => setQOptC(e.target.value)}
                      placeholder="Option C"
                      className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      required
                      value={qOptD}
                      onChange={(e) => setQOptD(e.target.value)}
                      placeholder="Option D"
                      className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Correct Option</label>
                      <select
                        value={qCorrectIdx}
                        onChange={(e) => setQCorrectIdx(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value={0}>Option A</option>
                        <option value={1}>Option B</option>
                        <option value={2}>Option C</option>
                        <option value={3}>Option D</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium mb-1">Formula Used</label>
                      <input
                        type="text"
                        value={qFormula}
                        onChange={(e) => setQFormula(e.target.value)}
                        placeholder="e.g., F = q(v × B)"
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Step-by-Step Explanation</label>
                    <input
                      type="text"
                      value={qExplanation}
                      onChange={(e) => setQExplanation(e.target.value)}
                      placeholder="Concise solution explanation..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Save Question to Bank
                    </button>
                  </div>
                </form>
              )}

              {studioTab === 'ncert' && (
                <form
                  onSubmit={handleAddNcertSubmit}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">Subject</label>
                      <select
                        value={ncSubject}
                        onChange={(e) => setNcSubject(e.target.value as SubjectName)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option>Physics</option>
                        <option>Chemistry</option>
                        <option>Mathematics</option>
                        <option>Biology</option>
                        <option>Social Science</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Chapter</label>
                      <input
                        type="text"
                        required
                        value={ncChapter}
                        onChange={(e) => setNcChapter(e.target.value)}
                        placeholder="e.g., Current Electricity"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Exercise Ref</label>
                      <input
                        type="text"
                        required
                        value={ncRef}
                        onChange={(e) => setNcRef(e.target.value)}
                        placeholder="e.g., NCERT Ch 3 · Ex 3.4"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">NCERT Question</label>
                    <input
                      type="text"
                      required
                      value={ncQuestion}
                      onChange={(e) => setNcQuestion(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Solution Steps (One step per line)
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={ncStepsText}
                      onChange={(e) => setNcStepsText(e.target.value)}
                      placeholder={'1. Given values...\n2. Applying formula...'}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Final Answer</label>
                    <input
                      type="text"
                      required
                      value={ncFinalAns}
                      onChange={(e) => setNcFinalAns(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Publish NCERT Solution
                    </button>
                  </div>
                </form>
              )}

              {studioTab === 'import' && (
                <form
                  onSubmit={handleBulkImportSubmit}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                >
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Paste JSON matching the exported schema (containing any subset of{' '}
                    <code className="font-mono">chapters</code>,{' '}
                    <code className="font-mono">questions</code>,{' '}
                    <code className="font-mono">dppSheets</code>,{' '}
                    <code className="font-mono">ncertSolutions</code>,{' '}
                    <code className="font-mono">mockTests</code>, or{' '}
                    <code className="font-mono">flashcards</code>) to bulk-populate SQLite atomically.
                  </p>
                  <textarea
                    rows={8}
                    required
                    value={bulkJsonText}
                    onChange={(e) => setBulkJsonText(e.target.value)}
                    placeholder='{ "questions": [ ... ], "chapters": [ ... ] }'
                    className="w-full px-3.5 py-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import JSON into SQLite</span>
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}

          {sidebarTab === 'community' && <CommunityForumModule userRole="teacher" />}
        </main>
      </div>

      {/* Schedule New Live Class Modal */}
      {scheduleOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Schedule New Live Class"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold font-display">Schedule Live Session</h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setScheduleOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSchedule} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium mb-1">Session Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Classification of Plants - Kingdom Plantae-2"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Subject</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value as SubjectName)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option>Physics</option>
                    <option>Chemistry</option>
                    <option>Mathematics</option>
                    <option>Biology</option>
                    <option>English</option>
                    <option>Vedic Mathematics</option>
                    <option>Social Science</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Grade</label>
                  <select
                    value={gradeLabel}
                    onChange={(e) => setGradeLabel(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option>Grade 7</option>
                    <option>Grade 9</option>
                    <option>Grade 10</option>
                    <option>Grade 11</option>
                    <option>Grade 12</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Time Slot</label>
                <input
                  type="text"
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
                >
                  Publish Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
