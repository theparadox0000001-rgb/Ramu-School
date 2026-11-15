import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ClipboardCheck,
  Copy,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  AdminTestAttemptRow,
  AdminTestDetailPayload,
  AdminTestSummary,
  DifficultyLevel,
  MockTestTemplate,
  QuestionItem,
  SubjectName,
} from '../../types/portal';
import { portalApi } from '../../services/api';
import { AnswerSheetModal } from './AnswerSheetModal';

interface AdminTestsPanelProps {
  questions: QuestionItem[];
  onInspectStudent: (studentId: string) => void;
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
  onRefreshParent: () => Promise<void> | void;
}

type TestsViewTab = 'assessments' | 'attempts' | 'publish';

const SUBJECT_OPTIONS: SubjectName[] = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'English',
];

export const AdminTestsPanel: React.FC<AdminTestsPanelProps> = ({
  questions,
  onInspectStudent,
  onNotify,
  onError,
  onRefreshParent,
}) => {
  const [subTab, setSubTab] = useState<TestsViewTab>('assessments');
  const [tests, setTests] = useState<AdminTestSummary[]>([]);
  const [allAttempts, setAllAttempts] = useState<AdminTestAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [testSearch, setTestSearch] = useState('');
  const [attemptSearch, setAttemptSearch] = useState('');
  const [attemptCategoryFilter, setAttemptCategoryFilter] = useState<string>('All');

  // Test 360° Drill-down
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [testDetail, setTestDetail] = useState<AdminTestDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Editable test fields
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] =
    useState<MockTestTemplate['category']>('All India Test Series');
  const [editDifficulty, setEditDifficulty] = useState<DifficultyLevel>('Moderate');
  const [editDuration, setEditDuration] = useState(45);
  const [editNegMarking, setEditNegMarking] = useState(true);
  const [editSubjects, setEditSubjects] = useState<SubjectName[]>(['Physics']);
  const [editQuestionIds, setEditQuestionIds] = useState<string[]>([]);

  // Publish new test fields
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] =
    useState<MockTestTemplate['category']>('All India Test Series');
  const [newDifficulty, setNewDifficulty] = useState<DifficultyLevel>('Moderate');
  const [newDuration, setNewDuration] = useState(45);
  const [newNegMarking, setNewNegMarking] = useState(true);
  const [newSubjects, setNewSubjects] = useState<SubjectName[]>([
    'Physics',
    'Chemistry',
    'Mathematics',
  ]);
  const [newQuestionIds, setNewQuestionIds] = useState<string[]>([]);

  // Answer Sheet modal
  const [inspectAttemptId, setInspectAttemptId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [testsRes, attemptsRes] = await Promise.all([
        portalApi.getAdminTests(),
        portalApi.getAdminAttempts(),
      ]);
      setTests(testsRes.tests);
      setAllAttempts(attemptsRes.attempts);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to load tests and attempts ledger.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  const loadTestDetail = useCallback(
    async (testId: string) => {
      setLoadingDetail(true);
      try {
        const detail = await portalApi.getAdminTestDetail(testId);
        setTestDetail(detail);
        setEditTitle(detail.mockTest.title);
        setEditCategory(detail.mockTest.category);
        setEditDifficulty(detail.mockTest.difficulty);
        setEditDuration(detail.mockTest.durationMin);
        setEditNegMarking(detail.mockTest.negativeMarking);
        setEditSubjects(detail.mockTest.subjects);
        setEditQuestionIds(detail.mockTest.questionIds);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Unable to load test analytics.');
      } finally {
        setLoadingDetail(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedTestId) {
      void loadTestDetail(selectedTestId);
    } else {
      setTestDetail(null);
    }
  }, [selectedTestId, loadTestDetail]);

  const filteredTests = useMemo(() => {
    const q = testSearch.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.subjects.join(' ').toLowerCase().includes(q)
    );
  }, [tests, testSearch]);

  const filteredAttempts = useMemo(() => {
    const q = attemptSearch.trim().toLowerCase();
    return allAttempts.filter((a) => {
      if (attemptCategoryFilter !== 'All' && a.category !== attemptCategoryFilter) return false;
      if (!q) return true;
      return (
        a.studentName.toLowerCase().includes(q) ||
        a.admissionId.toLowerCase().includes(q) ||
        a.testTitle.toLowerCase().includes(q) ||
        a.batchCode.toLowerCase().includes(q)
      );
    });
  }, [allAttempts, attemptSearch, attemptCategoryFilter]);

  const attemptCategories = useMemo(
    () => ['All', ...Array.from(new Set(allAttempts.map((a) => a.category)))],
    [allAttempts]
  );

  const handleSaveTestEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testDetail) return;
    setBusy(true);
    try {
      await portalApi.updateMockTest(testDetail.mockTest.id, {
        title: editTitle,
        category: editCategory,
        difficulty: editDifficulty,
        durationMin: editDuration,
        negativeMarking: editNegMarking,
        subjects: editSubjects.length > 0 ? editSubjects : ['Physics'],
        questionIds: editQuestionIds,
      });
      await Promise.all([loadTestDetail(testDetail.mockTest.id), loadData(), onRefreshParent()]);
      onNotify(`Saved edits to "${editTitle}".`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update assessment.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloneTest = async (id: string) => {
    setBusy(true);
    try {
      const res = await portalApi.cloneMockTest(id);
      await Promise.all([loadData(), onRefreshParent()]);
      onNotify(`Cloned test into ${res.id}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to clone assessment.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTest = async (id: string) => {
    setBusy(true);
    try {
      await portalApi.deleteMockTest(id);
      if (selectedTestId === id) setSelectedTestId(null);
      await Promise.all([loadData(), onRefreshParent()]);
      onNotify(`Deleted mock test ${id}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete mock test.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await portalApi.createMockTest({
        title: newTitle,
        category: newCategory,
        difficulty: newDifficulty,
        durationMin: newDuration,
        negativeMarking: newNegMarking,
        subjects: newSubjects.length > 0 ? newSubjects : ['Physics'],
        questionIds: newQuestionIds,
      });
      setNewTitle('');
      setNewQuestionIds([]);
      setSubTab('assessments');
      await Promise.all([loadData(), onRefreshParent()]);
      onNotify('Published new assessment to Student Test Engine.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to publish assessment.');
    } finally {
      setBusy(false);
    }
  };

  // ============================================================================
  // TEST 360° DETAIL DRILL-DOWN VIEW
  // ============================================================================
  if (selectedTestId) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedTestId(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Tests</span>
          </button>

          {testDetail && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCloneTest(testDetail.mockTest.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Clone Paper</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDeleteTest(testDetail.mockTest.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Test</span>
              </button>
            </div>
          )}
        </div>

        {loadingDetail && !testDetail ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
            <div className="w-7 h-7 rounded-full border-2 border-blue-700 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Computing question-level analytics & student ranklist...
            </p>
          </div>
        ) : !testDetail ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Assessment not found.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Test Editor Form */}
            <form
              onSubmit={handleSaveTestEdit}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Edit Paper Blueprint · {testDetail.mockTest.id}</span>
                </h2>
                <button
                  type="submit"
                  disabled={busy || editQuestionIds.length === 0}
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  Save Paper Changes ({editQuestionIds.length * 4} Marks)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Paper Title
                  </label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) =>
                      setEditCategory(e.target.value as MockTestTemplate['category'])
                    }
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="All India Test Series">All India Test Series</option>
                    <option value="Chapter Mastery">Chapter Mastery</option>
                    <option value="Previous Year Paper">Previous Year Paper</option>
                    <option value="CYOT Custom">CYOT Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Difficulty
                  </label>
                  <select
                    value={editDifficulty}
                    onChange={(e) => setEditDifficulty(e.target.value as DifficultyLevel)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="Foundation">Foundation</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Duration (Min)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={240}
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {SUBJECT_OPTIONS.map((sub) => {
                    const checked = editSubjects.includes(sub);
                    return (
                      <label
                        key={sub}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setEditSubjects((prev) =>
                              checked ? prev.filter((s) => s !== sub) : [...prev, sub]
                            )
                          }
                        />
                        <span>{sub}</span>
                      </label>
                    );
                  })}
                </div>
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editNegMarking}
                    onChange={(e) => setEditNegMarking(e.target.checked)}
                  />
                  <span>NTA +4 / -1 Negative Marking</span>
                </label>
              </div>

              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
                {testDetail.allQuestions.map((q) => {
                  const checked = editQuestionIds.includes(q.id);
                  return (
                    <label
                      key={q.id}
                      className="flex items-start gap-2.5 p-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setEditQuestionIds((prev) =>
                            checked ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                          )
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{q.subject}:</span> {q.prompt}
                      </span>
                    </label>
                  );
                })}
              </div>
            </form>

            {/* Student Ranklist for this Test */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold font-display">
                  Student Submissions & Ranklist ({testDetail.attempts.length})
                </h3>
              </div>
              {testDetail.attempts.length === 0 ? (
                <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
                  No student attempts recorded for this assessment yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Rank</th>
                        <th className="py-2.5 px-4 font-semibold">Student · Batch</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Score</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Accuracy</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Time</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                      {testDetail.attempts.map((att, idx) => (
                        <tr key={att.id}>
                          <td className="py-3 px-4 font-mono font-bold">#{idx + 1}</td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => onInspectStudent(att.userId)}
                              className="font-semibold text-slate-900 dark:text-white hover:text-blue-700 dark:hover:text-blue-400 hover:underline cursor-pointer text-left"
                            >
                              {att.studentName}
                            </button>
                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {att.admissionId} · {att.batchCode || 'ONLINE'} · {att.dateLabel}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                            {att.score}/{att.maxScore}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                            {att.accuracyPercent}%
                          </td>
                          <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                            {att.timeSpentMin}m
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setInspectAttemptId(att.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-semibold cursor-pointer"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              <span>Answer Sheet</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Per-Question Item Analysis */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold font-display">
                  Question-Level Difficulty & Option Telemetry ({testDetail.questionStats.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Question</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Attempts</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Correct Rate</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Option Split (A/B/C/D)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                    {testDetail.questionStats.map((qs, i) => (
                      <tr key={qs.question.id}>
                        <td className="py-3 px-4 max-w-md">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            Q{i + 1}. {qs.question.prompt}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {qs.question.subject} · {qs.question.difficulty} · Key:{' '}
                            {['A', 'B', 'C', 'D'][qs.question.correctIndex]}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                          {qs.attemptsCount}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-blue-700 dark:bg-blue-500"
                                style={{ width: `${qs.correctRatePercent}%` }}
                              />
                            </div>
                            <span className="font-mono font-semibold w-9 text-right">
                              {qs.correctRatePercent}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                          {qs.optionCounts.join(' / ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {inspectAttemptId && (
          <AnswerSheetModal
            attemptId={inspectAttemptId}
            onClose={() => setInspectAttemptId(null)}
            onAttemptVoided={async () => {
              if (selectedTestId) {
                await Promise.all([loadTestDetail(selectedTestId), loadData(), onRefreshParent()]);
              }
            }}
          />
        )}
      </div>
    );
  }

  // ============================================================================
  // MAIN TESTS & ATTEMPTS HUB
  // ============================================================================
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            All Tests & Student Attempt Ledger 360°
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Inspect every mock paper, question-level option analytics, ranklists, CYOT custom attempts, and individual answer sheets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync Tests</span>
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
        {(
          [
            { id: 'assessments', label: `All Assessments (${tests.length})` },
            { id: 'attempts', label: `Every Student Attempt (${allAttempts.length})` },
            { id: 'publish', label: 'Publish New Mock Test' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === tab.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* VIEW 1: ALL ASSESSMENTS */}
      {subTab === 'assessments' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={testSearch}
              onChange={(e) => setTestSearch(e.target.value)}
              placeholder="Search mock test title, category, or subject..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Assessment Paper</th>
                  <th className="py-3 px-4 font-semibold">Subjects · Config</th>
                  <th className="py-3 px-4 font-semibold text-right">Attempts</th>
                  <th className="py-3 px-4 font-semibold text-right">Avg Score</th>
                  <th className="py-3 px-4 font-semibold text-right">Avg Accuracy</th>
                  <th className="py-3 px-4 font-semibold text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                {filteredTests.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{t.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t.category} · {t.difficulty}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-slate-800 dark:text-slate-200">{t.subjects.join(' · ')}</p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {t.questionIds.length} Qs · {t.totalMarks} marks · {t.durationMin}m
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                      {t.attemptsCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                      {t.avgScore}/{t.totalMarks} (Top {t.highestScore})
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                      {t.avgAccuracyPercent}%
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTestId(t.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                        >
                          Inspect & Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleCloneTest(t.id)}
                          aria-label={`Clone ${t.title}`}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeleteTest(t.id)}
                          aria-label={`Delete ${t.title}`}
                          className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* VIEW 2: GLOBAL ATTEMPT LEDGER */}
      {subTab === 'attempts' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={attemptSearch}
                onChange={(e) => setAttemptSearch(e.target.value)}
                placeholder="Search student, admission ID, batch, or test title..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            <select
              aria-label="Filter attempts by category"
              value={attemptCategoryFilter}
              onChange={(e) => setAttemptCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              {attemptCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            {filteredAttempts.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No test attempts match the current search.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Student · Batch</th>
                    <th className="py-3 px-4 font-semibold">Assessment</th>
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold text-right">Score</th>
                    <th className="py-3 px-4 font-semibold text-right">Accuracy</th>
                    <th className="py-3 px-4 font-semibold text-right">Inspection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                  {filteredAttempts.map((att) => (
                    <tr key={att.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onInspectStudent(att.userId)}
                          className="font-semibold text-slate-900 dark:text-white hover:text-blue-700 dark:hover:text-blue-400 hover:underline cursor-pointer text-left"
                        >
                          {att.studentName}
                        </button>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {att.admissionId} · {att.batchCode || 'ONLINE'}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {att.testTitle}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {att.category} · {att.timeSpentMin}m
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {att.dateLabel}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                        {att.score}/{att.maxScore}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                        {att.accuracyPercent}%
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setInspectAttemptId(att.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-semibold cursor-pointer"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          <span>Answer Sheet</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {/* VIEW 3: PUBLISH NEW MOCK TEST */}
      {subTab === 'publish' && (
        <form
          onSubmit={handleCreateTest}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 max-w-4xl"
        >
          <h2 className="text-sm font-bold font-display">Assemble & Publish New Mock Test</h2>
          <div>
            <label className="block text-xs font-medium mb-1">Test Title</label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g., AITS Major Test #08 · Electromagnetism & Calculus"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MockTestTemplate['category'])}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="All India Test Series">All India Test Series</option>
                <option value="Chapter Mastery">Chapter Mastery</option>
                <option value="Previous Year Paper">Previous Year Paper</option>
                <option value="CYOT Custom">CYOT Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Difficulty</label>
              <select
                value={newDifficulty}
                onChange={(e) => setNewDifficulty(e.target.value as DifficultyLevel)}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="Foundation">Foundation</option>
                <option value="Moderate">Moderate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Duration (Min)</label>
              <input
                type="number"
                min={10}
                max={180}
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {SUBJECT_OPTIONS.map((sub) => {
                const checked = newSubjects.includes(sub);
                return (
                  <label
                    key={sub}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setNewSubjects((prev) =>
                          checked ? prev.filter((s) => s !== sub) : [...prev, sub]
                        )
                      }
                    />
                    <span>{sub}</span>
                  </label>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newNegMarking}
                onChange={(e) => setNewNegMarking(e.target.checked)}
              />
              <span>Enable NTA +4 / -1 Negative Marking</span>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                Select Questions ({newQuestionIds.length} selected ·{' '}
                <span className="font-mono">{newQuestionIds.length * 4} Marks</span>)
              </span>
              <button
                type="button"
                onClick={() =>
                  setNewQuestionIds(
                    newQuestionIds.length === questions.length ? [] : questions.map((q) => q.id)
                  )
                }
                className="text-blue-700 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
              >
                {newQuestionIds.length === questions.length ? 'Clear All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
              {questions.map((q) => {
                const checked = newQuestionIds.includes(q.id);
                return (
                  <label
                    key={q.id}
                    className="flex items-start gap-2.5 p-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setNewQuestionIds((prev) =>
                          checked ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                        )
                      }
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {q.prompt}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {q.subject} · {q.difficulty} · {q.chapterTitle}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy || newQuestionIds.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Publish Mock Test</span>
            </button>
          </div>
        </form>
      )}

      {inspectAttemptId && (
        <AnswerSheetModal
          attemptId={inspectAttemptId}
          onClose={() => setInspectAttemptId(null)}
          onAttemptVoided={async () => {
            await Promise.all([loadData(), onRefreshParent()]);
            onNotify('Voided student test attempt.');
          }}
        />
      )}
    </div>
  );
};
