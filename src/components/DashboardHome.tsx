import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Flame,
  FlaskConical,
  Globe2,
  Leaf,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Plus,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Target,
  Type,
  Video,
} from 'lucide-react';
import type {
  ChapterItem,
  EnrollmentItem,
  ExamTrack,
  GamificationSummary,
  LiveClassItem,
  NavSection,
  StudentProfile,
  StudyTask,
  SubjectName,
  TestAttemptRecord,
} from '../types/portal';
import { PROGRAM_OPTIONS } from '../data/curriculumData';
import { portalApi } from '../services/api';

interface DashboardHomeProps {
  student: StudentProfile;
  chapters: ChapterItem[];
  liveClasses: LiveClassItem[];
  testHistory: TestAttemptRecord[];
  tasks: StudyTask[];
  gamification?: GamificationSummary | null;
  enrollments?: EnrollmentItem[];
  onChangeProgram: (track: ExamTrack, programName: string, grade: string) => void;
  onNavigate: (section: NavSection) => void;
  onSelectSubject: (subject: SubjectName) => void;
  onQuickDoubt: (question: string) => void;
  onJoinLiveClass: (liveClass: LiveClassItem) => void;
  onToggleReminder: (id: string) => void;
  onToggleTask: (id: string) => void;
  onAddTask?: (task: Omit<StudyTask, 'id'>) => void;
}

const SUBJECT_TILES: Array<{
  subject: SubjectName;
  icon: React.ComponentType<{ className?: string }>;
  tileBg: string;
  iconColor: string;
}> = [
  {
    subject: 'Chemistry',
    icon: FlaskConical,
    tileBg: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200/80 dark:border-sky-900',
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
  {
    subject: 'Mathematics',
    icon: Calculator,
    tileBg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-900',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    subject: 'Physics',
    icon: Lightbulb,
    tileBg: 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200/80 dark:border-yellow-900',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  {
    subject: 'Biology',
    icon: Leaf,
    tileBg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-900',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    subject: 'English',
    icon: Type,
    tileBg: 'bg-rose-50 dark:bg-rose-950/50 border-rose-200/80 dark:border-rose-900',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
  {
    subject: 'Vedic Mathematics',
    icon: Sparkles,
    tileBg: 'bg-orange-50 dark:bg-orange-950/50 border-orange-200/80 dark:border-orange-900',
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
  {
    subject: 'Social Science',
    icon: Globe2,
    tileBg: 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200/80 dark:border-indigo-900',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
  },
];

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  student,
  chapters,
  liveClasses,
  testHistory,
  tasks,
  gamification,
  enrollments = [],
  onChangeProgram,
  onNavigate,
  onSelectSubject,
  onQuickDoubt,
  onJoinLiveClass,
  onToggleReminder,
  onToggleTask,
  onAddTask,
}) => {
  const [programMenuOpen, setProgramMenuOpen] = useState(false);
  const [quickDoubtText, setQuickDoubtText] = useState('');
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState<{
    focusDiagnosis: string;
    weeklyStrategy: string;
    tasks: Array<{
      title: string;
      subject: SubjectName;
      day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
      durationMin: number;
    }>;
    provider: 'gemini' | 'offline-engine';
  } | null>(null);
  const [addedAiTaskIdx, setAddedAiTaskIdx] = useState<Record<number, boolean>>({});

  const totalLessons = chapters.reduce((acc, c) => acc + c.lessons.length, 0);
  const completedLessons = chapters.reduce(
    (acc, c) => acc + c.lessons.filter((l) => l.completed).length,
    0
  );
  const avgAccuracy =
    testHistory.length > 0
      ? Math.round(
          testHistory.reduce((acc, t) => acc + t.accuracyPercent, 0) / testHistory.length
        )
      : 0;

  const todaysLive = liveClasses.filter((c) => c.status === 'live' || c.status === 'upcoming');

  const handleGenerateStudyPlan = async () => {
    setAiPlanLoading(true);
    setAddedAiTaskIdx({});
    try {
      const weakTopics = chapters
        .filter((c) => c.masteryPercent < 70)
        .slice(0, 3)
        .map((c) => `${c.subject}: ${c.title}`);
      const res = await portalApi.generateAiStudyPlan({
        studentName: student.name,
        track: student.track,
        dailyGoalHours: student.dailyGoalHours,
        weakTopics: weakTopics.length > 0 ? weakTopics : ['Electrostatics', 'Ionic Equilibrium'],
        avgAccuracyPercent: avgAccuracy || 75,
      });
      setAiPlan(res);
    } catch {
      // ignore fallback
    } finally {
      setAiPlanLoading(false);
    }
  };

  const handleQuickDoubtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDoubtText.trim()) {
      onNavigate('aina');
      return;
    }
    onQuickDoubt(quickDoubtText.trim());
    setQuickDoubtText('');
  };

  return (
    <div className="space-y-8">
      {/* Top Home Title + Program Selector Dropdown (matching student.infinitylearn.com) */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Home
          </h1>

          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setProgramMenuOpen(!programMenuOpen)}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
              <span>{student.programName}</span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {programMenuOpen && (
              <div className="absolute left-0 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-30">
                {PROGRAM_OPTIONS.map((opt) => (
                  <button
                    key={opt.programName}
                    type="button"
                    onClick={() => {
                      onChangeProgram(opt.track, opt.programName, opt.grade);
                      setProgramMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer ${
                      student.programName === opt.programName
                        ? 'text-blue-700 dark:text-blue-400 font-semibold'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{opt.programName}</span>
                    <span className="text-[11px] text-slate-400">{opt.grade}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => onNavigate('tests')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
            <span>Create Test (CYOT)</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('analytics')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>SCORE Report</span>
          </button>
        </div>
      </section>

      {/* Activities for today */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
            Activities for today
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('live')}
            className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
          >
            View Schedule
          </button>
        </div>

        {todaysLive.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-700 dark:text-blue-400">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  No scheduled live classes remaining today
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Explore recorded lectures or start a custom CYOT sprint below.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tests')}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white cursor-pointer whitespace-nowrap"
            >
              Start CYOT
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {todaysLive.slice(0, 2).map((cls) => (
              <div
                key={cls.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <img
                    src={cls.instructorAvatar}
                    alt={cls.instructor}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-blue-700 dark:text-blue-400">
                        {cls.subject}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          cls.status === 'live'
                            ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                            : ''
                        }
                      >
                        {cls.scheduledTime}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
                      {cls.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {cls.instructor} · {cls.gradeLabel}
                    </p>
                  </div>
                </div>

                {cls.status === 'live' ? (
                  <button
                    type="button"
                    onClick={() => onJoinLiveClass(cls)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Join Class
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleReminder(cls.id)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg border cursor-pointer whitespace-nowrap shrink-0 ${
                      cls.reminded
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cls.reminded ? 'Reminded' : 'Notify Me'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Choose a Subject (Exact 7-Subject Grid from Student Interface Screenshot) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
            Choose a Subject
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('courses')}
            className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
          >
            All Modules
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3.5">
          {SUBJECT_TILES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.subject}
                type="button"
                onClick={() => onSelectSubject(item.subject)}
                className="group flex flex-col items-center text-center gap-2.5 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-600 dark:hover:border-blue-500 transition-colors cursor-pointer"
              >
                <div
                  className={`w-full h-16 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-[1.03] ${item.tileBg}`}
                >
                  <Icon className={`w-6 h-6 ${item.iconColor}`} />
                </div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                  {item.subject}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Stuck on a problem? Ask your doubt here (From Screenshot) */}
      <section className="rounded-2xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-5 sm:p-6">
        <form
          onSubmit={handleQuickDoubtSubmit}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              Stuck on a problem?
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Ask your doubt here — AINA solves equations, diagrams, and NCERT concepts in seconds.
            </p>
          </div>

          <div className="flex-1 max-w-xl flex items-center gap-2">
            <input
              type="text"
              value={quickDoubtText}
              onChange={(e) => setQuickDoubtText(e.target.value)}
              placeholder="Type a Physics, Chemistry, Math, or Biology doubt..."
              className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask AINA</span>
            </button>
          </div>
        </form>
      </section>

      {/* 4-Column Study Metrics + Active Tasks */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Weekly Study Logged</span>
              <Video className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2 tabular-nums">
              {student.weeklyHoursLogged} hrs
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
              +4.2 hrs vs last week
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Daily Streak</span>
              <Flame className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2 tabular-nums">
              {student.streakDays} days
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Target: {student.dailyGoalHours} hrs/day
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Mock Accuracy</span>
              <Target className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2 tabular-nums">
              {avgAccuracy}%
            </p>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>SCORE Benchmark</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Lessons Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2 tabular-nums">
              {completedLessons} / {totalLessons}
            </p>
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Resume Syllabus</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                Active Revision Checklist
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('bookmarks')}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Manage Tasks
            </button>
          </div>

          <div className="space-y-2">
            {tasks.slice(0, 3).map((task) => (
              <label
                key={task.id}
                className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => onToggleTask(task.id)}
                  className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-semibold ${
                      task.completed
                        ? 'line-through text-slate-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                    {task.subject} · {task.day} · {task.durationMin} min
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* AI Adaptive Study Planner + Enrolled Batches & Gamification Strip */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>AI Weekly Study Plan Generator</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Synthesizes weak chapters & SCORE accuracy into actionable daily tasks.
              </p>
            </div>
            <button
              type="button"
              disabled={aiPlanLoading}
              onClick={() => void handleGenerateStudyPlan()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {aiPlanLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{aiPlan ? 'Regenerate Plan' : 'Generate AI Plan'}</span>
            </button>
          </div>

          {aiPlan ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {aiPlan.focusDiagnosis}
                </p>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {aiPlan.weeklyStrategy}
                </p>
                <p className="text-[11px] font-mono text-blue-700 dark:text-blue-400">
                  Engine: {aiPlan.provider === 'gemini' ? 'Gemini 4' : 'Ramu Adaptive Engine'}
                </p>
              </div>
              <div className="space-y-2">
                {aiPlan.tasks.map((t, idx) => (
                  <div
                    key={`${t.title}-${idx}`}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {t.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {t.subject} · {t.day} · {t.durationMin} min
                      </p>
                    </div>
                    {onAddTask && (
                      <button
                        type="button"
                        disabled={!!addedAiTaskIdx[idx]}
                        onClick={() => {
                          onAddTask({
                            title: t.title,
                            subject: t.subject,
                            day: t.day,
                            durationMin: t.durationMin,
                            completed: false,
                          });
                          setAddedAiTaskIdx((prev) => ({ ...prev, [idx]: true }));
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{addedAiTaskIdx[idx] ? 'Added' : 'Add'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              Click &ldquo;Generate AI Plan&rdquo; to build a personalized {student.track} sprint aligned with your {student.dailyGoalHours} hr/day target.
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-600" />
              <span>XP & Enrolled Batches</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('marketplace')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Course Store</span>
            </button>
          </div>

          {gamification && (
            <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60 space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                <span>
                  Level {gamification.level} · {gamification.levelTitle}
                </span>
                <span className="font-mono tabular-nums text-amber-800 dark:text-amber-300">
                  {gamification.xpPoints} / {gamification.nextLevelXp} XP
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-amber-200/70 dark:bg-amber-950 overflow-hidden">
                <div
                  className="h-full bg-amber-600"
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
            </div>
          )}

          <div className="space-y-2">
            {enrollments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Explore Courses & Store to enroll in live AITS & Rank Booster batches.
              </p>
            ) : (
              enrollments.slice(0, 3).map((enr) => (
                <div
                  key={enr.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {enr.courseTitle}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {enr.status} · Valid until {enr.validUntil}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-blue-700 dark:text-blue-400 tabular-nums shrink-0">
                    {enr.progressPercent}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
