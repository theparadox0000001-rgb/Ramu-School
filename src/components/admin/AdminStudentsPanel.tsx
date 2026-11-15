import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  AdminStudentDetailPayload,
  AdminStudentSummary,
  BatchCohort,
  ExamTrack,
  StudyTask,
  SubjectName,
} from '../../types/portal';
import { portalApi } from '../../services/api';
import { AnswerSheetModal } from './AnswerSheetModal';

interface AdminStudentsPanelProps {
  batches: BatchCohort[];
  selectedStudentId: string | null;
  onSelectStudentId: (id: string | null) => void;
  initialBatchFilter?: string;
  onImpersonateUser: (userId: string) => Promise<void>;
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
  onRefreshParent: () => Promise<void> | void;
}

type DetailTab = 'attempts' | 'chapters' | 'errors_tasks' | 'doubts_tickets';

const TRACK_OPTIONS: ExamTrack[] = ['IIT-JEE', 'NEET UG', 'CBSE Class 12', 'CBSE Grade 10'];
const SUBJECT_OPTIONS: SubjectName[] = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'English',
  'Vedic Mathematics',
  'Social Science',
];
const PROGRAM_OPTIONS = [
  'IIT-JEE 2027 Comprehensive Program',
  'NEET UG 2027 Target Medical Program',
  'CBSE Class 12 Board Excellence Program',
  'CBSE Grade 10 Science Full Program',
];

export const AdminStudentsPanel: React.FC<AdminStudentsPanelProps> = ({
  batches,
  selectedStudentId,
  onSelectStudentId,
  initialBatchFilter = 'all',
  onImpersonateUser,
  onNotify,
  onError,
  onRefreshParent,
}) => {
  const [students, setStudents] = useState<AdminStudentSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState(initialBatchFilter);
  const [trackFilter, setTrackFilter] = useState<'all' | ExamTrack>('all');

  const [detail, setDetail] = useState<AdminStudentDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('attempts');
  const [busy, setBusy] = useState(false);

  // Answer sheet inspection
  const [inspectAttemptId, setInspectAttemptId] = useState<string | null>(null);

  // Student edit fields
  const [editBatchId, setEditBatchId] = useState<string>('');
  const [editTrack, setEditTrack] = useState<ExamTrack>('IIT-JEE');
  const [editProgram, setEditProgram] = useState<string>(PROGRAM_OPTIONS[0]);
  const [editGoalHours, setEditGoalHours] = useState<number>(4);

  // Reset password form
  const [newPassword, setNewPassword] = useState('');
  const [newDobPin, setNewDobPin] = useState('');

  // Assign task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskSubject, setTaskSubject] = useState<SubjectName>('Physics');
  const [taskDay, setTaskDay] = useState<StudyTask['day']>('Mon');
  const [taskDuration, setTaskDuration] = useState(45);

  useEffect(() => {
    setBatchFilter(initialBatchFilter);
  }, [initialBatchFilter]);

  const loadStudents = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await portalApi.getAdminStudents();
      setStudents(res.students);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to load students directory.');
    } finally {
      setLoadingList(false);
    }
  }, [onError]);

  const loadDetail = useCallback(
    async (studentId: string) => {
      setLoadingDetail(true);
      try {
        const res = await portalApi.getAdminStudentDetail(studentId);
        setDetail(res);
        setEditBatchId(res.student.batchId || '');
        setEditTrack(res.student.track);
        setEditProgram(res.student.programName);
        setEditGoalHours(4);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Unable to load student 360° profile.');
      } finally {
        setLoadingDetail(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (selectedStudentId) {
      void loadDetail(selectedStudentId);
    } else {
      setDetail(null);
    }
  }, [selectedStudentId, loadDetail]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (batchFilter !== 'all' && (s.batchId || '') !== batchFilter) return false;
      if (trackFilter !== 'all' && s.track !== trackFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.admissionId.toLowerCase().includes(q) ||
        (s.batchCode || '').toLowerCase().includes(q) ||
        (s.campus || '').toLowerCase().includes(q)
      );
    });
  }, [students, search, batchFilter, trackFilter]);

  const handleSaveStudentMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      const targetBatch = batches.find((b) => b.id === editBatchId);
      await portalApi.updateAdminUser(detail.student.id, {
        batchId: editBatchId || null,
        campus: targetBatch?.campus || detail.student.campus,
        track: editTrack,
        programName: editProgram,
        dailyGoalHours: editGoalHours,
      });
      await Promise.all([loadDetail(detail.student.id), loadStudents(), onRefreshParent()]);
      onNotify(`Updated enrollment & batch assignment for ${detail.student.name}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update student settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (!newPassword.trim() && !newDobPin.trim()) {
      onError('Enter a new password or DOB PIN before resetting.');
      return;
    }
    setBusy(true);
    try {
      await portalApi.resetUserCredentials(detail.student.id, {
        newPassword: newPassword.trim() || undefined,
        dobPin: newDobPin.trim() || undefined,
      });
      setNewPassword('');
      setNewDobPin('');
      await onRefreshParent();
      onNotify(`Credentials updated for ${detail.student.name} (${detail.student.admissionId}).`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to reset credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      await portalApi.assignStudentTask(detail.student.id, {
        title: taskTitle,
        subject: taskSubject,
        day: taskDay,
        durationMin: taskDuration,
      });
      setTaskTitle('');
      await Promise.all([loadDetail(detail.student.id), onRefreshParent()]);
      onNotify(`Assigned mandatory task to ${detail.student.name}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to assign task.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLessonOverride = async (lessonId: string, nextCompleted: boolean) => {
    if (!detail) return;
    setBusy(true);
    try {
      await portalApi.overrideStudentLesson(detail.student.id, lessonId, {
        completed: nextCompleted,
      });
      await Promise.all([loadDetail(detail.student.id), loadStudents()]);
      onNotify(`Lesson completion updated for ${detail.student.name}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to override lesson state.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearErrorLog = async (questionId: string) => {
    if (!detail) return;
    setBusy(true);
    try {
      await portalApi.clearStudentErrorLog(detail.student.id, questionId);
      await Promise.all([loadDetail(detail.student.id), loadStudents()]);
      onNotify(`Cleared question ${questionId} from ${detail.student.name}'s error log.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to clear error log entry.');
    } finally {
      setBusy(false);
    }
  };

  const handleImpersonate = async (userId: string) => {
    setBusy(true);
    try {
      await onImpersonateUser(userId);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to launch student shadow session.');
    } finally {
      setBusy(false);
    }
  };

  // ============================================================================
  // DETAIL 360° VIEW
  // ============================================================================
  if (selectedStudentId) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onSelectStudentId(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Students</span>
          </button>

          {detail && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleImpersonate(detail.student.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Launch Live Student Portal as {detail.student.name}</span>
            </button>
          )}
        </div>

        {loadingDetail && !detail ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
            <div className="w-7 h-7 rounded-full border-2 border-blue-700 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Loading Student 360° telemetry...
            </p>
          </div>
        ) : !detail ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Student profile unavailable.
          </div>
        ) : (
          <>
            {/* Student Header & KPI Bar */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-700 text-white font-bold flex items-center justify-center text-base shrink-0">
                    {detail.student.initials}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">
                      {detail.student.name}
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      <span className="font-mono">{detail.student.admissionId}</span> ·{' '}
                      {detail.student.email || 'No email'} · {detail.student.phone || 'No phone'}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {detail.batch
                        ? `${detail.batch.code} (${detail.batch.name}) · ${detail.batch.campus}`
                        : detail.student.campus || 'Unassigned Campus'}{' '}
                      · {detail.student.track} · {detail.student.grade}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 text-right tabular-nums">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Tests</p>
                    <p className="text-lg font-bold font-mono">{detail.testAttempts.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Error Qs</p>
                    <p className="text-lg font-bold font-mono text-rose-700 dark:text-rose-400">
                      {detail.errorLogQuestions.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">DPPs Done</p>
                    <p className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                      {detail.dppSheets.filter((d) => d.completed).length}/{detail.dppSheets.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Streak</p>
                    <p className="text-lg font-bold font-mono">{detail.student.streakDays}d</p>
                  </div>
                </div>
              </div>

              {/* Admin Edit Controls: Batch / Track / Program & Password Reset */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-4">
                <form
                  onSubmit={handleSaveStudentMeta}
                  className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end"
                >
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Assigned Batch
                    </label>
                    <select
                      value={editBatchId}
                      onChange={(e) => setEditBatchId(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="">Unassigned</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} · {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Exam Track
                    </label>
                    <select
                      value={editTrack}
                      onChange={(e) => setEditTrack(e.target.value as ExamTrack)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {TRACK_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Subscription Plan
                    </label>
                    <select
                      value={PROGRAM_OPTIONS.includes(editProgram) ? editProgram : PROGRAM_OPTIONS[0]}
                      onChange={(e) => setEditProgram(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {PROGRAM_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    Save Enrollment
                  </button>
                </form>

                <form
                  onSubmit={handleResetCredentials}
                  className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end"
                >
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      New Password
                    </label>
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="e.g. Reset@2027"
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      DOB PIN
                    </label>
                    <input
                      type="date"
                      value={newDobPin}
                      onChange={(e) => setNewDobPin(e.target.value)}
                      className="w-full px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Reset Login</span>
                  </button>
                </form>
              </div>
            </section>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-x-auto">
              {(
                [
                  { id: 'attempts', label: `Test Attempts (${detail.testAttempts.length})` },
                  { id: 'chapters', label: `Chapter & Lesson Mastery (${detail.chapters.length})` },
                  {
                    id: 'errors_tasks',
                    label: `Error Log (${detail.errorLogQuestions.length}) & Tasks (${detail.tasks.length})`,
                  },
                  {
                    id: 'doubts_tickets',
                    label: `DPPs, Doubts (${detail.savedDoubts.length}) & Tickets (${detail.tickets.length})`,
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTab(t.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                    detailTab === t.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* SUBTAB 1: TEST ATTEMPTS */}
            {detailTab === 'attempts' && (
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                {detail.testAttempts.length === 0 ? (
                  <p className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    This student has not submitted any assessments yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4 font-semibold">Assessment</th>
                          <th className="py-3 px-4 font-semibold">Date</th>
                          <th className="py-3 px-4 font-semibold text-right">Score</th>
                          <th className="py-3 px-4 font-semibold text-right">Accuracy</th>
                          <th className="py-3 px-4 font-semibold text-right">C / W / S</th>
                          <th className="py-3 px-4 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                        {detail.testAttempts.map((att) => (
                          <tr key={att.id}>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {att.testTitle}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {att.category} · {att.timeSpentMin} min
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
                            <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                              {att.correctCount} / {att.incorrectCount} / {att.unattemptedCount}
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
            )}

            {/* SUBTAB 2: CHAPTER & LESSON PROGRESS */}
            {detailTab === 'chapters' && (
              <div className="space-y-4">
                {detail.chapters.map((ch) => (
                  <section
                    key={ch.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                  >
                    <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ch.subject} · {ch.unit} · {ch.weightage}
                        </p>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                          {ch.title}
                        </h3>
                      </div>
                      <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 tabular-nums shrink-0">
                        {ch.masteryPercent}% Mastery
                      </span>
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {ch.lessons.map((l) => (
                        <div
                          key={l.id}
                          className="px-5 py-3 flex items-center justify-between gap-4 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {l.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {l.type} · {l.durationMin} min · {l.instructor}
                              {l.bookmarked ? ' · Bookmarked' : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleToggleLessonOverride(l.id, !l.completed)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                              l.completed
                                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{l.completed ? 'Completed (Override)' : 'Mark Completed'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* SUBTAB 3: ERROR LOG & MANDATORY TASKS */}
            {detailTab === 'errors_tasks' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <section className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold font-display">
                      Active Error Log ({detail.errorLogQuestions.length})
                    </h3>
                  </div>
                  {detail.errorLogQuestions.length === 0 ? (
                    <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
                      Zero unresolved error log questions.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {detail.errorLogQuestions.map((q) => (
                        <div
                          key={q.id}
                          className="p-4 flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {q.prompt}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              {q.subject} · {q.chapterTitle} · {q.difficulty}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleClearErrorLog(q.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Clear</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="xl:col-span-6 space-y-4">
                  <form
                    onSubmit={handleAssignTask}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                  >
                    <h3 className="text-sm font-bold font-display">
                      Assign Mandatory Task / Remedial Revision
                    </h3>
                    <input
                      type="text"
                      required
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="e.g., Re-solve Rotational Dynamics Error Log (10 Qs)"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <div className="grid grid-cols-3 gap-2.5">
                      <select
                        value={taskSubject}
                        onChange={(e) => setTaskSubject(e.target.value as SubjectName)}
                        className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        {SUBJECT_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <select
                        value={taskDay}
                        onChange={(e) => setTaskDay(e.target.value as StudyTask['day'])}
                        className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={10}
                        max={240}
                        value={taskDuration}
                        onChange={(e) => setTaskDuration(Number(e.target.value))}
                        className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Push to Student Planner</span>
                      </button>
                    </div>
                  </form>

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                    {detail.tasks.length === 0 ? (
                      <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
                        No study tasks scheduled yet.
                      </p>
                    ) : (
                      detail.tasks.map((t) => (
                        <div
                          key={t.id}
                          className="p-4 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{t.title}</p>
                            <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                              {t.subject} · {t.day} · {t.durationMin} min
                            </p>
                          </div>
                          <span
                            className={`font-semibold whitespace-nowrap ${
                              t.completed
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {t.completed ? 'Done' : 'Pending'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}

            {/* SUBTAB 4: DPPs, DOUBTS & TICKETS */}
            {detailTab === 'doubts_tickets' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold font-display">DPP Progress</h3>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {detail.dppSheets.map((d) => (
                      <div key={d.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{d.title}</p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {d.subject} · {d.dateLabel}
                          </p>
                        </div>
                        <span
                          className={`font-semibold whitespace-nowrap ${
                            d.completed
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {d.completed ? 'Submitted' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold font-display">
                      Saved AINA Doubts ({detail.savedDoubts.length})
                    </h3>
                  </div>
                  {detail.savedDoubts.length === 0 ? (
                    <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
                      No saved AINA doubts.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {detail.savedDoubts.map((d) => (
                        <div key={d.id} className="p-4 space-y-1 text-xs">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {d.question}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {d.subject} · {d.mode} · {d.createdAt}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold font-display">
                      Support Tickets ({detail.tickets.length})
                    </h3>
                  </div>
                  {detail.tickets.length === 0 ? (
                    <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
                      No support tickets filed by this student.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {detail.tickets.map((t) => (
                        <div key={t.id} className="p-4 space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {t.subject}
                            </p>
                            <span
                              className={`font-semibold ${
                                t.status === 'Open'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {t.status}
                            </span>
                          </div>
                          <p className="text-slate-500 dark:text-slate-400">
                            {t.category} · {t.createdAt}
                          </p>
                          <p className="text-slate-700 dark:text-slate-300">{t.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}

        {inspectAttemptId && (
          <AnswerSheetModal
            attemptId={inspectAttemptId}
            onClose={() => setInspectAttemptId(null)}
            onAttemptVoided={async () => {
              if (detail) {
                await Promise.all([loadDetail(detail.student.id), loadStudents(), onRefreshParent()]);
                onNotify('Voided attempt and recalculated student analytics.');
              }
            }}
          />
        )}
      </div>
    );
  }

  // ============================================================================
  // DIRECTORY VIEW (ALL STUDENTS)
  // ============================================================================
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            All Students 360° Directory ({students.length})
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Inspect every student&apos;s batch, mastery, answer sheets, error log, DPPs, or shadow their live Student Portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStudents()}
          disabled={loadingList}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
          <span>Refresh Roster</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name, admission ID, batch, or campus..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>

        <select
          aria-label="Filter by Batch"
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="all">All Batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} · {b.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by Exam Track"
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value as 'all' | ExamTrack)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="all">All Tracks</option>
          {TRACK_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        {loadingList && students.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Loading all enrolled students...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No students match the current filters.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Student & Admission ID</th>
                <th className="py-3 px-4 font-semibold">Batch · Campus</th>
                <th className="py-3 px-4 font-semibold">Track</th>
                <th className="py-3 px-4 font-semibold text-right">Tests</th>
                <th className="py-3 px-4 font-semibold text-right">Avg Accuracy</th>
                <th className="py-3 px-4 font-semibold text-right">Lessons</th>
                <th className="py-3 px-4 font-semibold text-right">Errors · Streak</th>
                <th className="py-3 px-4 font-semibold text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
              {filteredStudents.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900 dark:text-white">{s.name}</p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {s.admissionId} · {s.email || s.phone}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {s.batchCode || 'Unassigned'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                      {s.campus || 'Online Cohort'}
                    </p>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">{s.track}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                    {s.testsTaken}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                    {s.avgAccuracyPercent}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                    {s.lessonsCompleted}/{s.totalLessons}
                  </td>
                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                    {s.errorLogCount} Qs · {s.streakDays}d
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectStudentId(s.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                      >
                        Inspect 360°
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleImpersonate(s.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Impersonate</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
