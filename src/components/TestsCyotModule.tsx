import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Flag,
  Loader2,
  MessageSquareText,
  Play,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  ChapterItem,
  DifficultyLevel,
  ExamTrack,
  MockTestTemplate,
  QuestionItem,
  SubjectName,
  TestAttemptRecord,
} from '../types/portal';
import { MOCK_TESTS, QUESTION_BANK } from '../data/curriculumData';
import { portalApi } from '../services/api';

interface TestsCyotModuleProps {
  chapters: ChapterItem[];
  questions?: QuestionItem[];
  mockTests?: MockTestTemplate[];
  errorLogIds?: string[];
  testHistory: TestAttemptRecord[];
  studentTrack?: ExamTrack;
  preselectedChapterId?: string | null;
  onClearPreselectedChapter: () => void;
  onCompleteTest: (attempt: TestAttemptRecord) => void;
  onRemoveErrorLog?: (questionId: string) => void;
  onAskAinaAboutQuestion: (subject: SubjectName, questionPrompt: string) => void;
}

interface ActiveExamState {
  title: string;
  category: string;
  questions: QuestionItem[];
  negativeMarking: boolean;
  durationSec: number | null;
  secondsLeft: number;
  currentIndex: number;
  responses: Record<string, number | null>;
  markedForReview: Record<string, boolean>;
  visited: Record<string, boolean>;
  startTimeMs: number;
}

export const TestsCyotModule: React.FC<TestsCyotModuleProps> = ({
  chapters,
  questions: propQuestions,
  mockTests: propMockTests,
  errorLogIds: propErrorLogIds,
  testHistory,
  studentTrack = 'IIT-JEE',
  preselectedChapterId,
  onClearPreselectedChapter,
  onCompleteTest,
  onRemoveErrorLog,
  onAskAinaAboutQuestion,
}) => {
  const activeQuestions = propQuestions ?? QUESTION_BANK;
  const activeMockTests = propMockTests ?? MOCK_TESTS;

  const [activeTab, setActiveTab] = useState<'cyot' | 'series' | 'history' | 'errors'>('cyot');
  const [errorLogIds, setErrorLogIds] = useState<string[]>(() => {
    if (propErrorLogIds) return propErrorLogIds;
    try {
      const raw = window.localStorage.getItem('il_portal_error_log_v2');
      if (raw) return JSON.parse(raw) as string[];
    } catch {
      // ignore storage errors
    }
    return ['q-phy-2', 'q-chem-1', 'q-math-2'];
  });

  useEffect(() => {
    if (propErrorLogIds) {
      setErrorLogIds(propErrorLogIds);
    }
  }, [propErrorLogIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem('il_portal_error_log_v2', JSON.stringify(errorLogIds));
    } catch {
      // ignore storage errors
    }
  }, [errorLogIds]);

  // CYOT builder state
  const [cyotSubjects, setCyotSubjects] = useState<SubjectName[]>([
    'Physics',
    'Chemistry',
    'Mathematics',
  ]);
  const [cyotChapters, setCyotChapters] = useState<string[]>([]);
  const [cyotDifficulty, setCyotDifficulty] = useState<'All' | DifficultyLevel>('All');
  const [cyotCount, setCyotCount] = useState<5 | 10 | 15>(5);
  const [cyotTimeMin, setCyotTimeMin] = useState<10 | 20 | 30 | 0>(15 as 10 | 20 | 30 | 0);
  const [cyotNegative, setCyotNegative] = useState(true);

  // AI Practice Question Generator state
  const [aiSubject, setAiSubject] = useState<SubjectName>('Physics');
  const [aiTopic, setAiTopic] = useState('Electrostatics & Gauss Law');
  const [aiDifficulty, setAiDifficulty] = useState<DifficultyLevel>('Moderate');
  const [aiCount, setAiCount] = useState<3 | 5>(3);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiQuestions, setAiQuestions] = useState<QuestionItem[]>([]);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'offline-engine' | null>(null);

  // Active test & result review state
  const [activeExam, setActiveExam] = useState<ActiveExamState | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [reviewAttempt, setReviewAttempt] = useState<TestAttemptRecord | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'correct' | 'incorrect' | 'unattempted'>(
    'all'
  );

  // Apply preselected chapter if launched from Courses or Analytics
  useEffect(() => {
    if (!preselectedChapterId) return;
    const targetChapter = chapters.find((c) => c.id === preselectedChapterId);
    if (targetChapter) {
      setActiveTab('cyot');
      setCyotSubjects([targetChapter.subject]);
      setCyotChapters([targetChapter.id]);
      setCyotDifficulty('All');
      setCyotCount(5);
    }
    onClearPreselectedChapter();
  }, [preselectedChapterId, chapters, onClearPreselectedChapter]);

  // Countdown timer for active exam
  useEffect(() => {
    if (!activeExam || activeExam.durationSec === null) return;
    const timer = window.setInterval(() => {
      setActiveExam((prev) => {
        if (!prev || prev.durationSec === null) return prev;
        if (prev.secondsLeft <= 1) {
          return { ...prev, secondsLeft: 0 };
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeExam?.title]);

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (activeExam && activeExam.durationSec !== null && activeExam.secondsLeft === 0) {
      finalizeExam(activeExam);
    }
  }, [activeExam?.secondsLeft]);

  const availableChaptersForCyot = useMemo(() => {
    return chapters.filter((c) => cyotSubjects.includes(c.subject));
  }, [chapters, cyotSubjects]);

  const cyotMatchingQuestions = useMemo(() => {
    return activeQuestions.filter((q) => {
      const matchSubj = cyotSubjects.length === 0 || cyotSubjects.includes(q.subject);
      const matchChap = cyotChapters.length === 0 || cyotChapters.includes(q.chapterId);
      const matchDiff = cyotDifficulty === 'All' || q.difficulty === cyotDifficulty;
      return matchSubj && matchChap && matchDiff;
    });
  }, [activeQuestions, cyotSubjects, cyotChapters, cyotDifficulty]);

  const toggleCyotSubject = (subj: SubjectName) => {
    setCyotSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    );
    setCyotChapters([]);
  };

  const toggleCyotChapter = (chapId: string) => {
    setCyotChapters((prev) =>
      prev.includes(chapId) ? prev.filter((c) => c !== chapId) : [...prev, chapId]
    );
  };

  const launchExam = (
    title: string,
    category: string,
    questions: QuestionItem[],
    durationMin: number,
    negativeMarking: boolean
  ) => {
    if (questions.length === 0) return;
    const firstQ = questions[0];
    setReviewAttempt(null);
    setConfirmSubmitOpen(false);
    setActiveExam({
      title,
      category,
      questions,
      negativeMarking,
      durationSec: durationMin > 0 ? durationMin * 60 : null,
      secondsLeft: durationMin > 0 ? durationMin * 60 : 0,
      currentIndex: 0,
      responses: {},
      markedForReview: {},
      visited: { [firstQ.id]: true },
      startTimeMs: Date.now(),
    });
  };

  const handleLaunchCyot = () => {
    const pool = cyotMatchingQuestions.slice(0, cyotCount);
    const subjLabel = cyotSubjects.length > 0 ? cyotSubjects.join(' & ') : 'Mixed';
    launchExam(
      `CYOT · ${subjLabel} (${pool.length} Qs)`,
      'CYOT Custom',
      pool,
      cyotTimeMin,
      cyotNegative
    );
  };

  const handleGenerateAiQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    setAiError('');
    try {
      const res = await portalApi.generateAiPracticeQuestions({
        subject: aiSubject,
        topic: aiTopic.trim(),
        track: studentTrack,
        difficulty: aiDifficulty,
        count: aiCount,
      });
      const mapped: QuestionItem[] = res.questions.map((q, idx) => ({
        id: `ai-q-${Date.now()}-${idx}`,
        subject: q.subject,
        chapterId: 'ai-custom',
        chapterTitle: q.chapterTitle || aiTopic.trim(),
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        formulaUsed: q.formulaUsed,
        explanation: q.explanation,
        avgTimeSec: 60,
      }));
      setAiQuestions(mapped);
      setAiProvider(res.provider);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to generate AI practice set.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleLaunchTemplate = (tpl: MockTestTemplate) => {
    const qs = tpl.questionIds
      .map((id) => activeQuestions.find((q) => q.id === id))
      .filter((q): q is QuestionItem => Boolean(q));
    launchExam(tpl.title, tpl.category, qs, tpl.durationMin, tpl.negativeMarking);
  };

  const finalizeExam = (exam: ActiveExamState) => {
    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;

    const subjectStats: Record<SubjectName, { correct: number; total: number }> = {
      Physics: { correct: 0, total: 0 },
      Chemistry: { correct: 0, total: 0 },
      Mathematics: { correct: 0, total: 0 },
      Biology: { correct: 0, total: 0 },
      English: { correct: 0, total: 0 },
      'Vedic Mathematics': { correct: 0, total: 0 },
      'Social Science': { correct: 0, total: 0 },
    };

    exam.questions.forEach((q) => {
      subjectStats[q.subject].total += 1;
      const ans = exam.responses[q.id];
      if (ans === undefined || ans === null) {
        unattempted += 1;
      } else if (ans === q.correctIndex) {
        correct += 1;
        subjectStats[q.subject].correct += 1;
      } else {
        incorrect += 1;
      }
    });

    const score = correct * 4 - (exam.negativeMarking ? incorrect * 1 : 0);
    const maxScore = exam.questions.length * 4;
    const attempted = correct + incorrect;
    const accuracyPercent = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const elapsedMin = Math.max(1, Math.round((Date.now() - exam.startTimeMs) / 60000));

    const subjectBreakdown = (Object.keys(subjectStats) as SubjectName[])
      .filter((s) => subjectStats[s].total > 0)
      .map((s) => ({
        subject: s,
        correct: subjectStats[s].correct,
        total: subjectStats[s].total,
        accuracy: Math.round((subjectStats[s].correct / subjectStats[s].total) * 100),
      }));

    const record: TestAttemptRecord = {
      id: `att-${Date.now()}`,
      testTitle: exam.title,
      category: exam.category,
      dateLabel: 'Today',
      score,
      maxScore,
      accuracyPercent,
      timeSpentMin: elapsedMin,
      correctCount: correct,
      incorrectCount: incorrect,
      unattemptedCount: unattempted,
      subjectBreakdown,
      responses: exam.responses,
      questionIds: exam.questions.map((q) => q.id),
    };

    // Update Error Log: remove resolved correct answers, add newly missed answers
    const newlyCorrectIds = new Set<string>();
    const newlyMissedIds = new Set<string>();
    exam.questions.forEach((q) => {
      const ans = exam.responses[q.id];
      if (ans === q.correctIndex) {
        newlyCorrectIds.add(q.id);
      } else if (ans !== undefined && ans !== null) {
        newlyMissedIds.add(q.id);
      }
    });
    setErrorLogIds((prev) => {
      const retained = prev.filter((id) => !newlyCorrectIds.has(id));
      newlyMissedIds.forEach((id) => {
        if (!retained.includes(id)) retained.unshift(id);
      });
      return retained;
    });

    setActiveExam(null);
    setConfirmSubmitOpen(false);
    setReviewAttempt(record);
    onCompleteTest(record);
  };

  const errorQuestions = useMemo(() => {
    return errorLogIds
      .map((id) => activeQuestions.find((q) => q.id === id))
      .filter((q): q is QuestionItem => Boolean(q));
  }, [activeQuestions, errorLogIds]);

  const handleLaunchErrorRecovery = () => {
    if (errorQuestions.length === 0) return;
    launchExam(
      `Error Recovery Test · ${errorQuestions.length} Missed Questions`,
      'Error Log Recovery',
      errorQuestions,
      Math.max(10, errorQuestions.length * 3),
      false
    );
  };

  const handleDownloadAttemptPaper = (attempt: TestAttemptRecord, questions: QuestionItem[]) => {
    const header = `INFINITY LEARN — QUESTION PAPER & DIAGNOSTIC KEY\nTest: ${attempt.testTitle}\nCategory: ${attempt.category} | Date: ${attempt.dateLabel}\nScore: ${attempt.score}/${attempt.maxScore} | Accuracy: ${attempt.accuracyPercent}%\n\n`;
    const body =
      questions.length > 0
        ? questions
            .map((q, i) => {
              const userAns = attempt.responses?.[q.id];
              const userLetter =
                userAns !== undefined && userAns !== null ? ['A', 'B', 'C', 'D'][userAns] : 'Unattempted';
              const corrLetter = ['A', 'B', 'C', 'D'][q.correctIndex];
              return `Q${i + 1}. [${q.subject} · ${q.chapterTitle}]\n${q.prompt}\n${q.options
                .map((o, idx) => `  ${['A', 'B', 'C', 'D'][idx]}. ${o}`)
                .join('\n')}\nYour Response: ${userLetter} | Correct Answer: ${corrLetter}\nFormula: ${q.formulaUsed}\nExplanation: ${q.explanation}\n`;
            })
            .join('\n----------------------------------------\n\n')
        : `Summary Breakdown:\n${attempt.subjectBreakdown
            .map((s) => `- ${s.subject}: ${s.correct}/${s.total} (${s.accuracy}%)`)
            .join('\n')}\n`;
    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${attempt.id}-paper-key.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 1. ACTIVE NTA-STYLE EXAM INTERFACE
  if (activeExam) {
    const q = activeExam.questions[activeExam.currentIndex];
    const selectedOpt = activeExam.responses[q.id] ?? null;

    const goToQuestion = (idx: number) => {
      const target = activeExam.questions[idx];
      if (!target) return;
      setActiveExam({
        ...activeExam,
        currentIndex: idx,
        visited: { ...activeExam.visited, [target.id]: true },
      });
    };

    return (
      <div className="space-y-5">
        {/* Exam Top Header */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeExam.category} · {activeExam.negativeMarking ? '+4 / -1 Marking' : '+4 / 0 Practice'}
            </p>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              {activeExam.title}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm font-semibold tabular-nums">
              <Clock className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>
                {activeExam.durationSec === null
                  ? 'Untimed'
                  : formatTimer(activeExam.secondsLeft)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setConfirmSubmitOpen(true)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap"
            >
              Submit Test
            </button>
          </div>
        </div>

        {/* Exam Body: Question Viewport + Palette */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  Question {activeExam.currentIndex + 1} of {activeExam.questions.length} ·{' '}
                  {q.subject} · {q.chapterTitle} · {q.difficulty}
                </span>
                {activeExam.markedForReview[q.id] && (
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                    <Flag className="w-3.5 h-3.5" />
                    <span>Marked for Review</span>
                  </span>
                )}
              </div>

              <p className="text-base font-medium text-slate-900 dark:text-white leading-relaxed">
                {q.prompt}
              </p>

              <div className="space-y-2.5">
                {q.options.map((opt, idx) => {
                  const isChosen = selectedOpt === idx;
                  const letter = ['A', 'B', 'C', 'D'][idx];
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setActiveExam({
                          ...activeExam,
                          responses: { ...activeExam.responses, [q.id]: idx },
                        })
                      }
                      className={`w-full text-left p-4 rounded-xl border transition-colors flex items-center gap-3.5 cursor-pointer ${
                        isChosen
                          ? 'border-blue-700 bg-blue-50 dark:bg-blue-950/50 dark:border-blue-500'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-semibold shrink-0 border ${
                          isChosen
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {letter}
                      </span>
                      <span className="text-sm text-slate-900 dark:text-slate-100">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Exam Action Footer */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={activeExam.currentIndex === 0}
                  onClick={() => goToQuestion(activeExam.currentIndex - 1)}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveExam({
                      ...activeExam,
                      responses: { ...activeExam.responses, [q.id]: null },
                    })
                  }
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Clear Response
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextIdx =
                      activeExam.currentIndex < activeExam.questions.length - 1
                        ? activeExam.currentIndex + 1
                        : 0;
                    const nextQ = activeExam.questions[nextIdx];
                    setActiveExam({
                      ...activeExam,
                      markedForReview: {
                        ...activeExam.markedForReview,
                        [q.id]: !activeExam.markedForReview[q.id],
                      },
                      currentIndex: nextIdx,
                      visited: { ...activeExam.visited, [nextQ.id]: true },
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 cursor-pointer whitespace-nowrap"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Mark for Review & Next</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (activeExam.currentIndex < activeExam.questions.length - 1) {
                      goToQuestion(activeExam.currentIndex + 1);
                    } else {
                      setConfirmSubmitOpen(true);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
                >
                  <span>
                    {activeExam.currentIndex === activeExam.questions.length - 1
                      ? 'Save & Review Submit'
                      : 'Save & Next'}
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Question Palette Sidebar */}
          <aside className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
              Question Palette
            </h2>

            <div className="grid grid-cols-5 gap-2">
              {activeExam.questions.map((item, idx) => {
                const answered =
                  activeExam.responses[item.id] !== undefined &&
                  activeExam.responses[item.id] !== null;
                const marked = !!activeExam.markedForReview[item.id];
                const visited = !!activeExam.visited[item.id];
                const isCurrent = idx === activeExam.currentIndex;

                let btnStyle =
                  'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950';
                if (marked) {
                  btnStyle =
                    'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
                } else if (answered) {
                  btnStyle =
                    'border-emerald-600 bg-emerald-600 text-white';
                } else if (visited) {
                  btnStyle =
                    'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300';
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goToQuestion(idx)}
                    className={`h-10 rounded-lg border text-xs font-mono font-semibold tabular-nums cursor-pointer ${btnStyle} ${
                      isCurrent ? 'ring-2 ring-blue-600 ring-offset-1 dark:ring-offset-slate-900' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span>Answered</span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {
                    activeExam.questions.filter(
                      (item) =>
                        activeExam.responses[item.id] !== undefined &&
                        activeExam.responses[item.id] !== null
                    ).length
                  }
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Marked for Review</span>
                <span className="font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                  {activeExam.questions.filter((item) => activeExam.markedForReview[item.id]).length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Unanswered</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                  {
                    activeExam.questions.filter(
                      (item) =>
                        activeExam.responses[item.id] === undefined ||
                        activeExam.responses[item.id] === null
                    ).length
                  }
                </span>
              </div>
            </div>
          </aside>
        </div>

        {/* Confirm Submit Modal */}
        {confirmSubmitOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm test submission"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Submit Test for Evaluation?
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                You have answered{' '}
                <strong className="font-mono">
                  {
                    activeExam.questions.filter(
                      (item) =>
                        activeExam.responses[item.id] !== undefined &&
                        activeExam.responses[item.id] !== null
                    ).length
                  }
                </strong>{' '}
                of <strong className="font-mono">{activeExam.questions.length}</strong> questions.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  Continue Test
                </button>
                <button
                  type="button"
                  onClick={() => finalizeExam(activeExam)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                >
                  Confirm & View Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. POST-TEST DIAGNOSTIC REPORT & SOLUTIONS VIEW
  if (reviewAttempt) {
    const reviewedQuestions = (reviewAttempt.questionIds || [])
      .map((id) => activeQuestions.find((q) => q.id === id))
      .filter((q): q is QuestionItem => Boolean(q));

    const filteredReview = reviewedQuestions.filter((q) => {
      const resp = reviewAttempt.responses?.[q.id];
      if (reviewFilter === 'correct') return resp === q.correctIndex;
      if (reviewFilter === 'incorrect') return resp !== undefined && resp !== null && resp !== q.correctIndex;
      if (reviewFilter === 'unattempted') return resp === undefined || resp === null;
      return true;
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {reviewAttempt.category} · Completed {reviewAttempt.dateLabel}
            </p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
              {reviewAttempt.testTitle} — Diagnostic Report
            </h1>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleDownloadAttemptPaper(reviewAttempt, reviewedQuestions)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Paper & Key (.txt)</span>
            </button>
            <button
              type="button"
              onClick={() => setReviewAttempt(null)}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              Back to Tests & CYOT
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Score</p>
            <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
              {reviewAttempt.score} / {reviewAttempt.maxScore}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Accuracy</p>
            <p className="text-2xl font-bold font-mono text-blue-700 dark:text-blue-400 mt-1 tabular-nums">
              {reviewAttempt.accuracyPercent}%
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Correct / Incorrect</p>
            <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
              {reviewAttempt.correctCount} / {reviewAttempt.incorrectCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Time Taken</p>
            <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
              {reviewAttempt.timeSpentMin} min
            </p>
          </div>
        </div>

        {/* Question-by-Question Solution Review */}
        {reviewedQuestions.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Step-by-Step Solution Review
              </h2>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {(['all', 'correct', 'incorrect', 'unattempted'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setReviewFilter(f)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize cursor-pointer ${
                      reviewFilter === f
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {filteredReview.map((q, idx) => {
                const userResp = reviewAttempt.responses?.[q.id];
                const isCorrect = userResp === q.correctIndex;
                const isUnattempted = userResp === undefined || userResp === null;

                return (
                  <div
                    key={q.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Q{idx + 1} · {q.subject} · {q.chapterTitle}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          isUnattempted
                            ? 'text-slate-500 dark:text-slate-400'
                            : isCorrect
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {isUnattempted ? (
                          <AlertCircle className="w-4 h-4" />
                        ) : isCorrect ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span>
                          {isUnattempted ? 'Unattempted (0)' : isCorrect ? 'Correct (+4)' : 'Incorrect (-1)'}
                        </span>
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                      {q.prompt}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {q.options.map((opt, optIdx) => {
                        const isAns = optIdx === q.correctIndex;
                        const isPicked = optIdx === userResp;
                        return (
                          <div
                            key={opt}
                            className={`p-3 rounded-lg border ${
                              isAns
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 font-semibold'
                                : isPicked
                                ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
                                : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {['A', 'B', 'C', 'D'][optIdx]}. {opt}
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <p className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400">
                        Formula: {q.formulaUsed}
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {q.explanation}
                      </p>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => onAskAinaAboutQuestion(q.subject, q.prompt)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <MessageSquareText className="w-3.5 h-3.5" />
                        <span>Ask AINA for Alternative Method</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. DEFAULT TESTS & CYOT PORTAL VIEW
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Test Series & CYOT Builder
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Create Your Own Test (CYOT) by chapter and difficulty, or take scheduled AITS mock papers.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit max-w-full overflow-x-auto">
          {([
            { id: 'cyot', label: 'Create Your Own Test' },
            { id: 'series', label: 'Mock Test Series' },
            { id: 'history', label: 'Attempt History' },
            { id: 'errors', label: `Error Log (${errorQuestions.length})` },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: CYOT BUILDER */}
      {activeTab === 'cyot' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display mb-3">
                1. Select Subjects
              </h2>
              <div className="flex flex-wrap gap-2">
                {([
                  'Physics',
                  'Chemistry',
                  'Mathematics',
                  'Biology',
                  'English',
                  'Vedic Mathematics',
                  'Social Science',
                ] as SubjectName[]).map(
                  (subj) => {
                    const active = cyotSubjects.includes(subj);
                    return (
                      <button
                        key={subj}
                        type="button"
                        onClick={() => toggleCyotSubject(subj)}
                        className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'border-blue-700 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:border-blue-500 dark:text-blue-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {subj}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  2. Filter Chapters (Optional — All selected by default)
                </h2>
                {cyotChapters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCyotChapters([])}
                    className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {availableChaptersForCyot.map((chap) => {
                  const selected = cyotChapters.includes(chap.id);
                  return (
                    <button
                      key={chap.id}
                      type="button"
                      onClick={() => toggleCyotChapter(chap.id)}
                      className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'border-blue-700 bg-blue-50/70 dark:bg-blue-950/40 dark:border-blue-500'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                        {chap.subject}
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                        {chap.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Difficulty Tier
                </label>
                <select
                  value={cyotDifficulty}
                  onChange={(e) => setCyotDifficulty(e.target.value as 'All' | DifficultyLevel)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="All">Mixed Levels</option>
                  <option value="Foundation">Foundation</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Max Questions
                </label>
                <select
                  value={cyotCount}
                  onChange={(e) => setCyotCount(Number(e.target.value) as 5 | 10 | 15)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                >
                  <option value={5}>5 Questions</option>
                  <option value={10}>10 Questions</option>
                  <option value={15}>15 Questions</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Timer Duration
                </label>
                <select
                  value={cyotTimeMin}
                  onChange={(e) => setCyotTimeMin(Number(e.target.value) as 10 | 20 | 30 | 0)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                >
                  <option value={10}>10 Minutes</option>
                  <option value={20}>20 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={0}>Untimed Practice</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cyotNegative}
                onChange={(e) => setCyotNegative(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Enable Exam Negative Marking (+4 correct, -1 incorrect)</span>
            </label>
          </div>

          {/* CYOT Summary & Launch + AI Practice Generator */}
          <div className="lg:col-span-4 space-y-5">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="text-xs font-semibold">CYOT Test Blueprint</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white font-display">
                  Ready to generate your custom quiz
                </h3>

                <div className="space-y-2.5 text-xs pt-2 border-t border-slate-200 dark:border-slate-800 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Matching Questions</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {Math.min(cyotCount, cyotMatchingQuestions.length)} selected (of{' '}
                      {cyotMatchingQuestions.length})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Difficulty</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {cyotDifficulty}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Time Limit</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {cyotTimeMin === 0 ? 'Untimed' : `${cyotTimeMin} min`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Maximum Marks</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {Math.min(cyotCount, cyotMatchingQuestions.length) * 4}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={cyotMatchingQuestions.length === 0}
                onClick={handleLaunchCyot}
                className="w-full py-3 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>Generate & Start CYOT</span>
              </button>
            </div>

            {/* AI Practice Question Generator */}
            <form
              onSubmit={handleGenerateAiQuiz}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs font-semibold">AI Question Synthesizer</span>
                </div>
                {aiProvider && (
                  <span className="text-[11px] font-mono text-slate-400">
                    {aiProvider === 'gemini' ? 'Gemini AI' : 'Offline Engine'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <select
                  aria-label="AI Subject"
                  value={aiSubject}
                  onChange={(e) => setAiSubject(e.target.value as SubjectName)}
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option>Physics</option>
                  <option>Chemistry</option>
                  <option>Mathematics</option>
                  <option>Biology</option>
                </select>
                <select
                  aria-label="AI Difficulty"
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as DifficultyLevel)}
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="Foundation">Foundation</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Topic (e.g., Rotational Dynamics)"
                  className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <select
                  aria-label="AI Question Count"
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value) as 3 | 5)}
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                >
                  <option value={3}>3 Qs</option>
                  <option value={5}>5 Qs</option>
                </select>
              </div>

              {aiError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{aiError}</p>
              )}

              <button
                type="submit"
                disabled={aiGenerating}
                className="w-full py-2.5 px-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/70 text-blue-800 dark:text-blue-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {aiGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{aiGenerating ? 'Synthesizing MCQs...' : 'Generate AI Practice Set'}</span>
              </button>

              {aiQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    launchExam(
                      `AI Practice · ${aiTopic.trim()} (${aiQuestions.length} Qs)`,
                      'CYOT Custom',
                      aiQuestions,
                      Math.max(5, aiQuestions.length * 2),
                      cyotNegative
                    )
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Launch Generated Quiz ({aiQuestions.length} Qs)</span>
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: MOCK TEST SERIES */}
      {activeTab === 'series' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {activeMockTests.map((tpl) => (
            <div
              key={tpl.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-5"
            >
              <div className="space-y-3">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  {tpl.category} · {tpl.difficulty}
                </p>
                <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  {tpl.title}
                </h2>
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 tabular-nums">
                  <p>Subjects: {tpl.subjects.join(', ')}</p>
                  <p>
                    {tpl.questionIds.length} Questions · {tpl.totalMarks} Marks · {tpl.durationMin}{' '}
                    min
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleLaunchTemplate(tpl)}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Mock Test</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: ATTEMPT HISTORY */}
      {activeTab === 'history' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-5 font-semibold">Test Name</th>
                <th className="py-3.5 px-4 font-semibold">Category</th>
                <th className="py-3.5 px-4 font-semibold">Date</th>
                <th className="py-3.5 px-4 font-semibold text-right">Score</th>
                <th className="py-3.5 px-4 font-semibold text-right">Accuracy</th>
                <th className="py-3.5 px-5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {testHistory.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-5 font-medium text-slate-900 dark:text-white">
                    {att.testTitle}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                    {att.category}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {att.dateLabel}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums">
                    {att.score}/{att.maxScore}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
                    {att.accuracyPercent}%
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <button
                      type="button"
                      onClick={() => setReviewAttempt(att)}
                      className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: ERROR LOG & RECOVERY TEST */}
      {activeTab === 'errors' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Error Log & Targeted Recovery Drill
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Incorrect questions from your CYOT and Mock Tests appear here automatically. Solve them correctly in a Recovery Test to clear them.
              </p>
            </div>
            <button
              type="button"
              disabled={errorQuestions.length === 0}
              onClick={handleLaunchErrorRecovery}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Launch Error Recovery Test ({errorQuestions.length})</span>
            </button>
          </div>

          {errorQuestions.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Error Log Clear — Zero Unresolved Mistakes
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Take a new CYOT or Mock Test to benchmark new chapters.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {errorQuestions.map((q) => (
                <div
                  key={q.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                      {q.subject} · {q.chapterTitle} · {q.difficulty}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorLogIds((prev) => prev.filter((id) => id !== q.id));
                        onRemoveErrorLog?.(q.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>

                  <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                    {q.prompt}
                  </p>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Correct Answer: {['A', 'B', 'C', 'D'][q.correctIndex]}. {q.options[q.correctIndex]}
                    </p>
                    <p className="text-xs font-mono text-blue-700 dark:text-blue-400">
                      Formula: {q.formulaUsed}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {q.explanation}
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onAskAinaAboutQuestion(q.subject, q.prompt)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" />
                      <span>Ask AINA Step-by-Step Hint</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
