import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  MessageSquareText,
  Pause,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import type {
  ChapterItem,
  DppSheetItem,
  LessonItem,
  NcertSolutionItem,
  QuestionItem,
  SubjectName,
} from '../types/portal';
import { INITIAL_DPP_SHEETS, NCERT_SOLUTIONS, QUESTION_BANK } from '../data/curriculumData';
import { portalApi } from '../services/api';

interface CoursesModuleProps {
  chapters: ChapterItem[];
  dppSheets?: DppSheetItem[];
  ncertSolutions?: NcertSolutionItem[];
  questions?: QuestionItem[];
  preselectedSubject?: SubjectName | null;
  onClearPreselectedSubject?: () => void;
  onToggleLessonComplete: (chapterId: string, lessonId: string) => void;
  onToggleLessonBookmark: (chapterId: string, lessonId: string) => void;
  onUpdateDpp?: (dppId: string, completed: boolean, answers?: Record<string, number>) => void;
  onAskAinaAboutLesson: (subject: SubjectName, topic: string) => void;
  onPracticeChapter: (chapterId: string) => void;
}

const ALL_SUBJECT_FILTERS: Array<'All' | SubjectName> = [
  'All',
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'English',
  'Vedic Mathematics',
  'Social Science',
];

export const CoursesModule: React.FC<CoursesModuleProps> = ({
  chapters,
  dppSheets: propDppSheets,
  ncertSolutions: propNcertSolutions,
  questions: propQuestions,
  preselectedSubject,
  onClearPreselectedSubject,
  onToggleLessonComplete,
  onToggleLessonBookmark,
  onUpdateDpp,
  onAskAinaAboutLesson,
  onPracticeChapter,
}) => {
  const [learnTab, setLearnTab] = useState<'syllabus' | 'dpp' | 'ncert'>('syllabus');
  const [selectedSubject, setSelectedSubject] = useState<'All' | SubjectName>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({
    'phy-magnetic': true,
    'phy-electrostatics': true,
    'chem-mixtures': true,
  });

  const activeQuestions = propQuestions ?? QUESTION_BANK;
  const activeNcert = propNcertSolutions ?? NCERT_SOLUTIONS;

  // DPP state synced with backend props or localStorage fallback
  const [dppSheets, setDppSheets] = useState<DppSheetItem[]>(() => {
    if (propDppSheets && propDppSheets.length > 0) return propDppSheets;
    try {
      const raw = window.localStorage.getItem('il_portal_dpp_v2');
      if (raw) return JSON.parse(raw) as DppSheetItem[];
    } catch {
      // ignore storage errors
    }
    return INITIAL_DPP_SHEETS;
  });
  const [activeDppId, setActiveDppId] = useState<string | null>('dpp-phy-today');
  const [dppAnswers, setDppAnswers] = useState<Record<string, Record<string, number>>>({});
  const [checkedDppIds, setCheckedDppIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (propDppSheets) {
      setDppSheets(propDppSheets);
    }
  }, [propDppSheets]);

  useEffect(() => {
    try {
      window.localStorage.setItem('il_portal_dpp_v2', JSON.stringify(dppSheets));
    } catch {
      // ignore storage errors
    }
  }, [dppSheets]);

  useEffect(() => {
    if (!preselectedSubject) return;
    setSelectedSubject(preselectedSubject);
    const matching = chapters.filter((c) => c.subject === preselectedSubject);
    if (matching.length > 0) {
      setExpandedChapters((prev) => ({ ...prev, [matching[0].id]: true }));
    }
    onClearPreselectedSubject?.();
  }, [preselectedSubject, chapters, onClearPreselectedSubject]);

  const [activeLessonModal, setActiveLessonModal] = useState<{
    chapter: ChapterItem;
    lesson: LessonItem;
  } | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<'1x' | '1.25x' | '1.5x' | '2x'>('1x');
  const [playProgress, setPlayProgress] = useState(32);
  const [aiSummaryMap, setAiSummaryMap] = useState<Record<string, string>>({});
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState('');

  const handleGenerateLectureSummary = async (
    lesson: LessonItem,
    subject: SubjectName
  ) => {
    setAiSummaryLoading(true);
    setAiSummaryError('');
    try {
      const res = await portalApi.generateAiLectureSummary({
        title: lesson.title,
        subject,
        notesContent: lesson.notesContent,
      });
      setAiSummaryMap((prev) => ({ ...prev, [lesson.id]: res.summary }));
    } catch (err) {
      setAiSummaryError(
        err instanceof Error ? err.message : 'Unable to summarize lecture notes.'
      );
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const filteredChapters = useMemo(() => {
    return chapters.filter((ch) => {
      const matchesSubject = selectedSubject === 'All' || ch.subject === selectedSubject;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        ch.title.toLowerCase().includes(q) ||
        ch.unit.toLowerCase().includes(q) ||
        ch.lessons.some((l) => l.title.toLowerCase().includes(q));
      return matchesSubject && matchesQuery;
    });
  }, [chapters, selectedSubject, searchQuery]);

  const filteredDppSheets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dppSheets.filter((sheet) => {
      const matchSubj = selectedSubject === 'All' || sheet.subject === selectedSubject;
      const matchQ =
        !q ||
        sheet.title.toLowerCase().includes(q) ||
        sheet.subject.toLowerCase().includes(q);
      return matchSubj && matchQ;
    });
  }, [dppSheets, selectedSubject, searchQuery]);

  const filteredNcert = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeNcert.filter((item) => {
      const matchSubj = selectedSubject === 'All' || item.subject === selectedSubject;
      const matchQ =
        !q ||
        item.chapter.toLowerCase().includes(q) ||
        item.exerciseRef.toLowerCase().includes(q) ||
        item.question.toLowerCase().includes(q);
      return matchSubj && matchQ;
    });
  }, [activeNcert, selectedSubject, searchQuery]);

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleDppComplete = (id: string) => {
    const current = dppSheets.find((s) => s.id === id);
    const nextCompleted = current ? !current.completed : true;
    setDppSheets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, completed: nextCompleted } : s))
    );
    onUpdateDpp?.(id, nextCompleted, dppAnswers[id]);
  };

  const handleDownloadNotes = (lesson: LessonItem, chapterTitle: string) => {
    const content = `INFINITY LEARN — STUDY NOTES\nChapter: ${chapterTitle}\nLesson: ${lesson.title}\nInstructor: ${lesson.instructor}\n\nKEY FORMULAS:\n${lesson.keyFormulas.join('\n')}\n\nNOTES:\n${lesson.notesContent}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lesson.id}-notes.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadNcert = (item: NcertSolutionItem) => {
    const content = `INFINITY LEARN — NCERT SOLUTION\n${item.subject} · ${item.chapter}\nReference: ${item.exerciseRef}\n\nQUESTION:\n${item.question}\n\nSTEP-BY-STEP SOLUTION:\n${item.solutionSteps.join('\n')}\n\nFINAL ANSWER:\n${item.finalAnswer}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.id}-ncert-solution.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentModalChapter = activeLessonModal
    ? chapters.find((c) => c.id === activeLessonModal.chapter.id) || activeLessonModal.chapter
    : null;
  const currentModalLesson =
    activeLessonModal && currentModalChapter
      ? currentModalChapter.lessons.find((l) => l.id === activeLessonModal.lesson.id) ||
        activeLessonModal.lesson
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Learn · Courses & Syllabus
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Concept lectures, downloadable formula sheets, and chapter practice quizzes across all 7 subjects.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chapters or lessons..."
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Primary Learn Mode Segmented Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit max-w-full overflow-x-auto">
          {([
            { id: 'syllabus', label: 'Syllabus & Lectures', icon: BookOpen },
            { id: 'dpp', label: 'DPP (Daily Practice)', icon: ClipboardCheck },
            { id: 'ncert', label: 'NCERT Solutions', icon: FileCheck2 },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLearnTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  learnTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Subject Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit max-w-full overflow-x-auto">
          {ALL_SUBJECT_FILTERS.map((subj) => (
            <button
              key={subj}
              type="button"
              onClick={() => setSelectedSubject(subj)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSubject === subj
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {subj}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: CHAPTER ACCORDION LIST */}
      {learnTab === 'syllabus' && (filteredChapters.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            No matching chapters found
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedSubject('All');
              setSearchQuery('');
            }}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredChapters.map((chapter) => {
            const isOpen = !!expandedChapters[chapter.id];
            const completedCount = chapter.lessons.filter((l) => l.completed).length;
            const pct = Math.round((completedCount / chapter.lessons.length) * 100);

            return (
              <div
                key={chapter.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => toggleChapter(chapter.id)}
                    className="flex-1 text-left flex items-start justify-between gap-4 cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          {chapter.subject}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{chapter.unit}</span>
                        <span aria-hidden="true">·</span>
                        <span>{chapter.weightage}</span>
                      </div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1 font-display">
                        {chapter.title}
                      </h2>
                    </div>
                  </button>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right tabular-nums">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        {completedCount}/{chapter.lessons.length} Lessons · {pct}%
                      </p>
                      <div className="w-28 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-1 overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onPracticeChapter(chapter.id)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      Chapter Quiz
                    </button>

                    <button
                      type="button"
                      aria-label={isOpen ? 'Collapse chapter' : 'Expand chapter'}
                      onClick={() => toggleChapter(chapter.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                    {chapter.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <button
                            type="button"
                            aria-label={
                              lesson.completed ? 'Mark lesson incomplete' : 'Mark lesson complete'
                            }
                            onClick={() => onToggleLessonComplete(chapter.id, lesson.id)}
                            className={`mt-0.5 shrink-0 cursor-pointer ${
                              lesson.completed
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-300 dark:text-slate-600 hover:text-slate-500'
                            }`}
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>

                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {lesson.title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                              <span className="inline-flex items-center gap-1">
                                {lesson.type === 'video' ? (
                                  <Video className="w-3.5 h-3.5" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5" />
                                )}
                                <span className="capitalize">{lesson.type}</span>
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{lesson.durationMin} min</span>
                              <span aria-hidden="true">·</span>
                              <span>{lesson.instructor}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            aria-label={lesson.bookmarked ? 'Remove bookmark' : 'Bookmark lesson'}
                            onClick={() => onToggleLessonBookmark(chapter.id, lesson.id)}
                            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                              lesson.bookmarked
                                ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <Bookmark className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadNotes(lesson, chapter.title)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Notes</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveLessonModal({ chapter, lesson });
                              setIsPlaying(true);
                              setPlayProgress(18);
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>{lesson.type === 'video' ? 'Watch Lesson' : 'Open Module'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* TAB 2: DPP (DAILY PRACTICE PAPERS) */}
      {learnTab === 'dpp' && (
        <div className="space-y-4">
          {filteredDppSheets.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
              <ClipboardCheck className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                No Daily Practice Papers match the current filter
              </p>
            </div>
          ) : (
            filteredDppSheets.map((sheet) => {
              const isOpen = activeDppId === sheet.id;
              const sheetQuestions = sheet.questionIds
                .map((id) => activeQuestions.find((q) => q.id === id))
                .filter((q): q is QuestionItem => Boolean(q));
              const responses = dppAnswers[sheet.id] || {};
              const isChecked = !!checkedDppIds[sheet.id];
              const correctCount = sheetQuestions.filter(
                (q) => responses[q.id] === q.correctIndex
              ).length;

              return (
                <div
                  key={sheet.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                >
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          {sheet.subject}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{sheet.dateLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{sheet.estimatedMin} min target</span>
                      </div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1 font-display">
                        {sheet.title}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleDppComplete(sheet.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer whitespace-nowrap ${
                          sheet.completed
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{sheet.completed ? 'DPP Completed' : 'Mark Complete'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveDppId(isOpen ? null : sheet.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
                      >
                        <span>{isOpen ? 'Hide Worksheet' : 'Solve DPP'}</span>
                        {isOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-200 dark:border-slate-800 p-5 space-y-5 bg-slate-50/50 dark:bg-slate-950/30">
                      {sheetQuestions.map((q, qIdx) => {
                        const chosen = responses[q.id];
                        const isRight = chosen === q.correctIndex;
                        return (
                          <div
                            key={q.id}
                            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Q{qIdx + 1} · {q.chapterTitle} · {q.difficulty}
                              </span>
                              {isChecked && (
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                    isRight
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-red-700 dark:text-red-400'
                                  }`}
                                >
                                  {isRight ? (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5" />
                                  )}
                                  <span>{isRight ? 'Correct' : 'Needs Review'}</span>
                                </span>
                              )}
                            </div>

                            <p className="text-sm font-medium text-slate-900 dark:text-white leading-relaxed">
                              {q.prompt}
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {q.options.map((opt, optIdx) => {
                                const selected = chosen === optIdx;
                                const isAns = optIdx === q.correctIndex;
                                let cls =
                                  'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200';
                                if (isChecked) {
                                  if (isAns) {
                                    cls =
                                      'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 font-semibold';
                                  } else if (selected) {
                                    cls =
                                      'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200';
                                  }
                                } else if (selected) {
                                  cls =
                                    'border-blue-700 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200 font-semibold';
                                }

                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    disabled={isChecked}
                                    onClick={() =>
                                      setDppAnswers((prev) => ({
                                        ...prev,
                                        [sheet.id]: { ...(prev[sheet.id] || {}), [q.id]: optIdx },
                                      }))
                                    }
                                    className={`text-left px-3.5 py-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${cls}`}
                                  >
                                    {['A', 'B', 'C', 'D'][optIdx]}. {opt}
                                  </button>
                                );
                              })}
                            </div>

                            {isChecked && (
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400">
                                    Formula: {q.formulaUsed}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => onAskAinaAboutLesson(q.subject, q.prompt)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                                  >
                                    <MessageSquareText className="w-3.5 h-3.5" />
                                    <span>Ask AINA</span>
                                  </button>
                                </div>
                                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                  {q.explanation}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                          {isChecked
                            ? `Score: ${correctCount} / ${sheetQuestions.length} Correct`
                            : `${Object.keys(responses).length} of ${sheetQuestions.length} answered`}
                        </div>
                        <div className="flex items-center gap-2">
                          {isChecked && (
                            <button
                              type="button"
                              onClick={() => {
                                setCheckedDppIds((prev) => ({ ...prev, [sheet.id]: false }));
                                setDppAnswers((prev) => ({ ...prev, [sheet.id]: {} }));
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Retry DPP</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCheckedDppIds((prev) => ({ ...prev, [sheet.id]: true }));
                              if (!sheet.completed) {
                                toggleDppComplete(sheet.id);
                              } else {
                                onUpdateDpp?.(sheet.id, true, responses);
                              }
                            }}
                            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                          >
                            {isChecked ? 'Checked & Logged' : 'Check DPP Answers'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: NCERT SOLUTIONS */}
      {learnTab === 'ncert' && (
        <div className="space-y-4">
          {filteredNcert.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
              <FileCheck2 className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                No NCERT Solutions match the selected filter
              </p>
            </div>
          ) : (
            filteredNcert.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {item.subject}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{item.chapter}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{item.exerciseRef}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadNcert(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download (.txt)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAskAinaAboutLesson(item.subject, item.question)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" />
                      <span>Ask AINA</span>
                    </button>
                  </div>
                </div>

                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-relaxed">
                  {item.question}
                </h2>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Step-by-Step NCERT Solution
                  </p>
                  {item.solutionSteps.map((step) => (
                    <p
                      key={step}
                      className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                    >
                      {step}
                    </p>
                  ))}
                  <p className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Final Answer: {item.finalAnswer}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* Interactive Lecture & Formula Notes Modal */}
      {currentModalChapter && currentModalLesson && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={currentModalLesson.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 overflow-y-auto"
        >
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {currentModalChapter.subject} · {currentModalChapter.title}
                </p>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate font-display">
                  {currentModalLesson.title}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close lesson player"
                onClick={() => setActiveLessonModal(null)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-7 p-6 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
                <div className="rounded-xl bg-slate-950 text-white p-6 flex flex-col justify-between min-h-[240px]">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{currentModalLesson.instructor}</span>
                    <span className="font-mono tabular-nums">
                      Speed {playbackSpeed} · {playProgress}%
                    </span>
                  </div>

                  <div className="my-6 space-y-2">
                    <p className="text-xs uppercase tracking-wider text-blue-400 font-semibold">
                      Key Concept Board
                    </p>
                    <p className="text-sm text-slate-200 leading-relaxed">
                      {currentModalLesson.summary}
                    </p>
                    <div className="pt-2 space-y-1">
                      {currentModalLesson.keyFormulas.map((formula) => (
                        <p
                          key={formula}
                          className="font-mono text-xs sm:text-sm text-emerald-300 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800"
                        >
                          {formula}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="range"
                      aria-label="Lesson timeline progress"
                      min={0}
                      max={100}
                      value={playProgress}
                      onChange={(e) => setPlayProgress(Number(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold cursor-pointer"
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isPlaying ? 'Pause' : 'Play'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {(['1x', '1.25x', '1.5x', '2x'] as const).map((spd) => (
                          <button
                            key={spd}
                            type="button"
                            onClick={() => setPlaybackSpeed(spd)}
                            className={`px-2 py-1 rounded text-xs font-mono cursor-pointer ${
                              playbackSpeed === spd
                                ? 'bg-white text-slate-900 font-semibold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {spd}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Lecture Timestamps
                  </p>
                  <div className="space-y-1.5">
                    {currentModalLesson.timestamps.map((ts, idx) => (
                      <button
                        key={ts.time}
                        type="button"
                        onClick={() => {
                          setPlayProgress((idx + 1) * 28);
                          setIsPlaying(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs cursor-pointer"
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {ts.label}
                        </span>
                        <span className="font-mono text-blue-700 dark:text-blue-400 tabular-nums">
                          {ts.time}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 p-6 flex flex-col justify-between gap-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Structured Formula & Revision Notes
                    </p>
                    <button
                      type="button"
                      disabled={aiSummaryLoading}
                      onClick={() =>
                        handleGenerateLectureSummary(currentModalLesson, currentModalChapter.subject)
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {aiSummaryLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {aiSummaryLoading ? 'Summarizing...' : 'AI Lecture Summary'}
                      </span>
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700 dark:text-slate-300 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    {currentModalLesson.notesContent}
                  </pre>

                  {aiSummaryError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400">{aiSummaryError}</p>
                  )}

                  {aiSummaryMap[currentModalLesson.id] && (
                    <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" />
                        <span>AI Key Takeaways</span>
                      </p>
                      <div className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {aiSummaryMap[currentModalLesson.id]}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onToggleLessonComplete(currentModalChapter.id, currentModalLesson.id)
                    }
                    className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 cursor-pointer ${
                      currentModalLesson.completed
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {currentModalLesson.completed ? 'Marked as Completed' : 'Mark Lesson Complete'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadNotes(currentModalLesson, currentModalChapter.title)}
                    className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Formula Notes (.txt)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const subj = currentModalChapter.subject;
                      const topic = currentModalLesson.title;
                      setActiveLessonModal(null);
                      onAskAinaAboutLesson(subj, `Explain the key trick in "${topic}"`);
                    }}
                    className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageSquareText className="w-4 h-4" />
                    <span>Ask AINA Mentor About This Lesson</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
