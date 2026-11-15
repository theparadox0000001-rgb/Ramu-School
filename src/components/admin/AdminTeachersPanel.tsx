import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  ExternalLink,
  KeyRound,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  AdminTeacherDetailPayload,
  AdminTeacherSummary,
  AttendanceStudent,
  ExamTrack,
  SubjectName,
} from '../../types/portal';
import { portalApi } from '../../services/api';

interface AdminTeachersPanelProps {
  selectedTeacherId: string | null;
  onSelectTeacherId: (id: string | null) => void;
  onInspectStudent: (studentId: string) => void;
  onImpersonateUser: (userId: string) => Promise<void>;
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
  onRefreshParent: () => Promise<void> | void;
}

type DetailTab = 'classes' | 'batches_students' | 'assignments_attendance';

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

export const AdminTeachersPanel: React.FC<AdminTeachersPanelProps> = ({
  selectedTeacherId,
  onSelectTeacherId,
  onInspectStudent,
  onImpersonateUser,
  onNotify,
  onError,
  onRefreshParent,
}) => {
  const [teachers, setTeachers] = useState<AdminTeacherSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState<'all' | ExamTrack>('all');

  const [detail, setDetail] = useState<AdminTeacherDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('classes');
  const [busy, setBusy] = useState(false);

  // Schedule Class for Faculty form
  const [clsTitle, setClsTitle] = useState('');
  const [clsSubject, setClsSubject] = useState<SubjectName>('Physics');
  const [clsGrade, setClsGrade] = useState('Class 12 · IIT-JEE');
  const [clsDate, setClsDate] = useState('Tomorrow');
  const [clsTime, setClsTime] = useState('6:00 PM - 7:15 PM');
  const [clsStatus, setClsStatus] = useState<'live' | 'upcoming' | 'recorded'>('upcoming');
  const [clsTrack, setClsTrack] = useState<ExamTrack>('IIT-JEE');

  // Password Reset & Campus Edit
  const [editCampus, setEditCampus] = useState('');
  const [editSubjects, setEditSubjects] = useState<SubjectName[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [newDobPin, setNewDobPin] = useState('');

  // Attendance draft
  const [rosterDraft, setRosterDraft] = useState<AttendanceStudent[]>([]);

  const loadTeachers = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await portalApi.getAdminTeachers();
      setTeachers(res.teachers);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to load faculty directory.');
    } finally {
      setLoadingList(false);
    }
  }, [onError]);

  const loadDetail = useCallback(
    async (teacherId: string) => {
      setLoadingDetail(true);
      try {
        const res = await portalApi.getAdminTeacherDetail(teacherId);
        setDetail(res);
        setEditCampus(res.teacher.campus || '');
        setEditSubjects(res.teacher.subjects || []);
        setClsSubject(res.teacher.subjects?.[0] || 'Physics');
        setClsTrack(res.teacher.track);
        setRosterDraft(res.attendanceRoster);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Unable to load faculty 360° profile.');
      } finally {
        setLoadingDetail(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    void loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    if (selectedTeacherId) {
      void loadDetail(selectedTeacherId);
    } else {
      setDetail(null);
    }
  }, [selectedTeacherId, loadDetail]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((t) => {
      if (trackFilter !== 'all' && t.track !== trackFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.admissionId.toLowerCase().includes(q) ||
        (t.campus || '').toLowerCase().includes(q) ||
        (t.subjects || []).join(' ').toLowerCase().includes(q)
      );
    });
  }, [teachers, search, trackFilter]);

  const handleSaveFacultyMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      await portalApi.updateAdminUser(detail.teacher.id, {
        campus: editCampus,
        subjects: editSubjects,
      });
      await Promise.all([loadDetail(detail.teacher.id), loadTeachers(), onRefreshParent()]);
      onNotify(`Updated campus & subject allocation for ${detail.teacher.name}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update faculty details.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (!newPassword.trim() && !newDobPin.trim()) {
      onError('Enter a password or PIN before resetting.');
      return;
    }
    setBusy(true);
    try {
      await portalApi.resetUserCredentials(detail.teacher.id, {
        newPassword: newPassword.trim() || undefined,
        dobPin: newDobPin.trim() || undefined,
      });
      setNewPassword('');
      setNewDobPin('');
      onNotify(`Updated credentials for ${detail.teacher.name} (${detail.teacher.admissionId}).`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to reset faculty credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleScheduleClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      await portalApi.scheduleFacultyClass(detail.teacher.id, {
        title: clsTitle,
        subject: clsSubject,
        gradeLabel: clsGrade,
        dateLabel: clsDate,
        timeRange: clsTime,
        status: clsStatus,
        track: clsTrack,
      });
      setClsTitle('');
      await Promise.all([loadDetail(detail.teacher.id), loadTeachers(), onRefreshParent()]);
      onNotify(`Scheduled live session for ${detail.teacher.name}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to schedule live session.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateClass = async (
    classId: string,
    patch: { status?: 'live' | 'upcoming' | 'recorded'; instructor?: string }
  ) => {
    if (!detail) return;
    setBusy(true);
    try {
      await portalApi.updateAdminLiveClass(classId, patch);
      await Promise.all([loadDetail(detail.teacher.id), loadTeachers(), onRefreshParent()]);
      onNotify('Updated live session allocation.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update live class.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!detail) return;
    setBusy(true);
    try {
      await portalApi.deleteContentEntity('live_classes', classId);
      await Promise.all([loadDetail(detail.teacher.id), loadTeachers(), onRefreshParent()]);
      onNotify(`Removed live class ${classId}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete class.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAssignment = async (id: string, current: 'Active' | 'Graded') => {
    if (!detail) return;
    setBusy(true);
    try {
      await portalApi.updateAssignmentStatus(id, current === 'Active' ? 'Graded' : 'Active');
      await loadDetail(detail.teacher.id);
      onNotify('Updated assignment grading status.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update assignment.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAttendance = async () => {
    setBusy(true);
    try {
      await portalApi.saveAttendance(rosterDraft);
      if (detail) await loadDetail(detail.teacher.id);
      onNotify('Saved batch attendance roll call to SQLite.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save attendance.');
    } finally {
      setBusy(false);
    }
  };

  const handleImpersonate = async (userId: string) => {
    setBusy(true);
    try {
      await onImpersonateUser(userId);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to launch faculty shadow session.');
    } finally {
      setBusy(false);
    }
  };

  // ============================================================================
  // DETAIL 360° VIEW
  // ============================================================================
  if (selectedTeacherId) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onSelectTeacherId(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Faculty</span>
          </button>

          {detail && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleImpersonate(detail.teacher.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Launch Live Teacher Console as {detail.teacher.name}</span>
            </button>
          )}
        </div>

        {loadingDetail && !detail ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
            <div className="w-7 h-7 rounded-full border-2 border-blue-700 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Loading Faculty 360° console...
            </p>
          </div>
        ) : !detail ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Faculty profile unavailable.
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 dark:bg-blue-700 text-white font-bold flex items-center justify-center text-base shrink-0">
                    {detail.teacher.initials}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">
                      {detail.teacher.name}
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      <span className="font-mono">{detail.teacher.admissionId}</span> ·{' '}
                      {detail.teacher.email} · {detail.teacher.grade}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {detail.teacher.campus || 'All India Online Faculty'} ·{' '}
                      {(detail.teacher.subjects || []).join(', ') || detail.teacher.track}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-5 text-right tabular-nums">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Live Sessions</p>
                    <p className="text-lg font-bold font-mono">{detail.liveClasses.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Batches Led</p>
                    <p className="text-lg font-bold font-mono">{detail.assignedBatches.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Batch Students</p>
                    <p className="text-lg font-bold font-mono">{detail.batchStudents.length}</p>
                  </div>
                </div>
              </div>

              {/* Campus, Subjects & Password Reset */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-4">
                <form onSubmit={handleSaveFacultyMeta} className="lg:col-span-7 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Assigned Campus / Center
                      </label>
                      <input
                        type="text"
                        value={editCampus}
                        onChange={(e) => setEditCampus(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      Save Faculty Allocation
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUBJECT_OPTIONS.slice(0, 5).map((sub) => {
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
                      placeholder="Faculty@2027"
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
                  { id: 'classes', label: `Live Classes & Polls (${detail.liveClasses.length})` },
                  {
                    id: 'batches_students',
                    label: `Assigned Batches (${detail.assignedBatches.length}) & Students (${detail.batchStudents.length})`,
                  },
                  {
                    id: 'assignments_attendance',
                    label: `Assignments (${detail.assignments.length}) & Attendance`,
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

            {/* SUBTAB 1: LIVE CLASSES & SCHEDULE */}
            {detailTab === 'classes' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <form
                  onSubmit={handleScheduleClass}
                  className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <h3 className="text-sm font-bold font-display flex items-center gap-2">
                    <CalendarPlus className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <span>Schedule Live Class for {detail.teacher.name}</span>
                  </h3>
                  <input
                    type="text"
                    required
                    value={clsTitle}
                    onChange={(e) => setClsTitle(e.target.value)}
                    placeholder="Session title (e.g. Rotational Inertia Deep Dive)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <div className="grid grid-cols-2 gap-2.5">
                    <select
                      value={clsSubject}
                      onChange={(e) => setClsSubject(e.target.value as SubjectName)}
                      className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {SUBJECT_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <select
                      value={clsTrack}
                      onChange={(e) => setClsTrack(e.target.value as ExamTrack)}
                      className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {TRACK_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={clsGrade}
                      onChange={(e) => setClsGrade(e.target.value)}
                      placeholder="Grade"
                      className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      value={clsDate}
                      onChange={(e) => setClsDate(e.target.value)}
                      placeholder="Date"
                      className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <select
                      value={clsStatus}
                      onChange={(e) =>
                        setClsStatus(e.target.value as 'live' | 'upcoming' | 'recorded')
                      }
                      className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="upcoming">upcoming</option>
                      <option value="live">live</option>
                      <option value="recorded">recorded</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={clsTime}
                    onChange={(e) => setClsTime(e.target.value)}
                    placeholder="Time window"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Schedule Session
                    </button>
                  </div>
                </form>

                <section className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                  {detail.liveClasses.length === 0 ? (
                    <p className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                      No live or upcoming sessions currently assigned to {detail.teacher.name}.
                    </p>
                  ) : (
                    detail.liveClasses.map((lc) => (
                      <div
                        key={lc.id}
                        className="p-4 flex flex-wrap items-center justify-between gap-4 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">
                            {lc.title}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                            {lc.subject} · {lc.gradeLabel} · {lc.dateLabel} · {lc.timeRange}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            {lc.attendeesCount} attendees · {lc.chatCount} chat msgs ·{' '}
                            {lc.totalPollVotes} poll votes
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            aria-label={`Status for ${lc.title}`}
                            disabled={busy}
                            value={lc.status}
                            onChange={(e) =>
                              void handleUpdateClass(lc.id, {
                                status: e.target.value as 'live' | 'upcoming' | 'recorded',
                              })
                            }
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="live">live</option>
                            <option value="upcoming">upcoming</option>
                            <option value="recorded">recorded</option>
                          </select>

                          <select
                            aria-label={`Reassign instructor for ${lc.title}`}
                            disabled={busy}
                            value={lc.instructor}
                            onChange={(e) =>
                              void handleUpdateClass(lc.id, { instructor: e.target.value })
                            }
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 max-w-[140px]"
                          >
                            {teachers.map((t) => (
                              <option key={t.id} value={t.name}>
                                {t.name}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDeleteClass(lc.id)}
                            aria-label={`Remove ${lc.title}`}
                            className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </section>
              </div>
            )}

            {/* SUBTAB 2: ASSIGNED BATCHES & STUDENTS */}
            {detailTab === 'batches_students' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <section className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold font-display">
                      Led Batches ({detail.assignedBatches.length})
                    </h3>
                  </div>
                  {detail.assignedBatches.length === 0 ? (
                    <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
                      No batches assigned as Lead Faculty.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {detail.assignedBatches.map((b) => (
                        <div key={b.id} className="p-4 space-y-1 text-xs">
                          <p className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                            {b.code} · {b.track}
                          </p>
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">
                            {b.name}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                            {b.campus} · {b.studentCount}/{b.capacity} seats · {b.scheduleSlot}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold font-display">
                      Students Under Faculty Supervision ({detail.batchStudents.length})
                    </h3>
                  </div>
                  {detail.batchStudents.length === 0 ? (
                    <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
                      No students enrolled in this faculty member&apos;s batches yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {detail.batchStudents.map((st) => (
                        <div
                          key={st.id}
                          className="p-4 flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{st.name}</p>
                            <p className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                              {st.admissionId} · {st.batchCode || st.track} · {st.campus}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onInspectStudent(st.id)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Open Student 360°
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* SUBTAB 3: ASSIGNMENTS & ROLL CALL ATTENDANCE */}
            {detailTab === 'assignments_attendance' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <section className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold font-display">
                      Faculty Assignments ({detail.assignments.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {detail.assignments.map((a) => (
                      <div
                        key={a.id}
                        className="p-4 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{a.title}</p>
                          <p className="text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                            {a.subject} · {a.gradeLabel} · Due {a.dueDate} · {a.submittedCount}/
                            {a.totalStudents} submitted
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleToggleAssignment(a.id, a.status)}
                          className={`px-3 py-1.5 rounded-lg border font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                            a.status === 'Graded'
                              ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                              : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {a.status}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-bold font-display">Batch Roll Call Roster</h3>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSaveAttendance()}
                      className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Save Roll Call
                    </button>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {rosterDraft.map((row) => (
                      <div
                        key={row.id}
                        className="p-3.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{row.name}</p>
                          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {row.rollNo}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                          {(['Present', 'Late', 'Absent'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() =>
                                setRosterDraft((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, status: st } : r))
                                )
                              }
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${
                                row.status === st
                                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                  : 'text-slate-500 dark:text-slate-400'
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
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ============================================================================
  // DIRECTORY VIEW (ALL FACULTY)
  // ============================================================================
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            All Teachers & Faculty 360° ({teachers.length})
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Monitor every faculty member&apos;s live classes, batch ownership, attendance rosters, or launch their live Teacher Console.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadTeachers()}
          disabled={loadingList}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
          <span>Refresh Faculty</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search faculty name, employee ID, subject, or campus..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>

        <select
          aria-label="Filter faculty by track"
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value as 'all' | ExamTrack)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="all">All Exam Tracks</option>
          {TRACK_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        {loadingList && teachers.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Loading faculty roster...
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No faculty members match the current filter.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Faculty & Staff ID</th>
                <th className="py-3 px-4 font-semibold">Campus · Subjects</th>
                <th className="py-3 px-4 font-semibold">Track</th>
                <th className="py-3 px-4 font-semibold text-right">Classes</th>
                <th className="py-3 px-4 font-semibold text-right">Batches Led</th>
                <th className="py-3 px-4 font-semibold text-right">Attendees</th>
                <th className="py-3 px-4 font-semibold text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
              {filteredTeachers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900 dark:text-white">{t.name}</p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {t.admissionId} · {t.email}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[220px]">
                      {t.campus || 'All India Online'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {(t.subjects || []).join(', ') || t.grade}
                    </p>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">{t.track}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                    {t.liveClassesCount} ({t.upcomingClassesCount} upcoming)
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                    {t.batchesLedCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                    {t.totalAttendeesReached.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectTeacherId(t.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                      >
                        Inspect 360°
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleImpersonate(t.id)}
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
