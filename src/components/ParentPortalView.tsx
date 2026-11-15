import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  LogOut,
  MessageSquare,
  Moon,
  Sun,
  TrendingUp,
} from 'lucide-react';
import type { ParentDashboardPayload, StudentProfile } from '../types/portal';
import { portalApi } from '../services/api';

interface ParentPortalViewProps {
  parent: StudentProfile;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSwitchToAdmin?: () => void;
  onLogout: () => void;
}

export const ParentPortalView: React.FC<ParentPortalViewProps> = ({
  parent,
  darkMode,
  onToggleDarkMode,
  onSwitchToAdmin,
  onLogout,
}) => {
  const [data, setData] = useState<ParentDashboardPayload | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Quick Parent-Teacher Note / Support Ticket
  const [ptmSubject, setPtmSubject] = useState('');
  const [ptmBody, setPtmBody] = useState('');
  const [ptmSuccess, setPtmSuccess] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const payload = await portalApi.getParentDashboard();
      setData(payload);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load parent telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const activeChild = data?.linkedChildren[selectedIdx] || data?.linkedChildren[0] || null;

  const handleSendPtmRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ptmSubject.trim() || !ptmBody.trim()) return;
    setPtmSuccess('');
    try {
      await portalApi.submitTicket({
        id: `TKT-PAR-${Date.now()}`,
        category: 'Parent PTM & Telemetry',
        subject: ptmSubject.trim(),
        message: ptmBody.trim(),
        status: 'Open',
        createdAt: 'Just now',
      });
      setPtmSubject('');
      setPtmBody('');
      setPtmSuccess('Inquiry sent directly to Ramu School Batch Coordinator & Mentor.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send PTM request.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Bar Branded Ramu School */}
      <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-700 text-white font-bold flex items-center justify-center text-sm shrink-0">
            RS
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate font-display">
              Ramu School · Parent Connect
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Guardian Telemetry & Fee Ledger · {parent.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {onSwitchToAdmin && (
            <button
              type="button"
              onClick={onSwitchToAdmin}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Admin Console</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label="Toggle theme"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-7 space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {loading || !activeChild ? (
          <div className="p-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
            Loading child academic performance & batch attendance...
          </div>
        ) : (
          <>
            {/* Linked Child Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
                  Ward Academic Summary · {activeChild.student.name}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {activeChild.student.admissionId} · {activeChild.student.track} ·{' '}
                  {activeChild.student.grade} · Batch:{' '}
                  {activeChild.batch?.name || 'Online National Cohort'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data?.linkedChildren.map((child, idx) => (
                  <button
                    key={child.student.id}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      idx === selectedIdx
                        ? 'border-blue-700 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {child.student.name} ({child.student.grade})
                  </button>
                ))}
              </div>
            </div>

            {/* 4 Key KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Live Attendance Rate
                </p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-2 tabular-nums font-display">
                  {activeChild.attendancePercent}%
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {activeChild.student.streakDays}-day continuous study streak
                </p>
              </div>
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  AITS & CBT Accuracy
                </p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-2 tabular-nums font-display">
                  {activeChild.avgAccuracyPercent}%
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  Across {activeChild.testsTaken} proctored assessments
                </p>
              </div>
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Curriculum Progress
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums font-display">
                  {activeChild.lessonsCompleted} / {activeChild.totalLessons}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Concept lectures & worksheets finished
                </p>
              </div>
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Weekly Study Hours
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums font-display">
                  {activeChild.student.weeklyHoursLogged} hrs
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Batch Lead: {activeChild.batch?.leadFaculty || 'Faculty Mentor'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Recent Test Attempts & Weak Chapters */}
              <div className="lg:col-span-7 space-y-6">
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                      Recent Assessment Transcript
                    </h2>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeChild.recentAttempts.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">No test attempts recorded yet.</p>
                    ) : (
                      activeChild.recentAttempts.map((att) => (
                        <div
                          key={att.id}
                          className="py-3 flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {att.testTitle}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                              {att.category} · {att.dateLabel} · {att.timeSpentMin} mins
                            </p>
                          </div>
                          <div className="text-right tabular-nums shrink-0">
                            <p className="font-bold text-slate-900 dark:text-white">
                              {att.score} / {att.maxScore}
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              {att.accuracyPercent}% Acc
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                      Recommended Revision Alerts
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {activeChild.weakChapters.map((wc, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-xs"
                      >
                        <p className="font-semibold text-amber-900 dark:text-amber-200">
                          {wc.subject}
                        </p>
                        <p className="text-slate-700 dark:text-slate-300 mt-0.5">{wc.title}</p>
                        <p className="text-amber-700 dark:text-amber-400 font-bold mt-2 tabular-nums">
                          Mastery: {wc.masteryPercent}%
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Right Column: Mentorship, Fee Receipts, PTM Inquiry */}
              <div className="lg:col-span-5 space-y-6">
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                      Faculty Mentorship Log
                    </h2>
                  </div>
                  {activeChild.mentorshipSessions.length === 0 ? (
                    <p className="text-xs text-slate-500">No mentorship check-ins scheduled yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {activeChild.mentorshipSessions.map((ms) => (
                        <div
                          key={ms.id}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs space-y-1"
                        >
                          <div className="flex justify-between font-semibold">
                            <span>{ms.mentorName}</span>
                            <span className="text-blue-700 dark:text-blue-400">{ms.status}</span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300">{ms.topic}</p>
                          <p className="text-slate-500 dark:text-slate-400">{ms.scheduledSlot}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                      Active Courses & Fee Invoices
                    </h2>
                  </div>
                  <div className="space-y-2">
                    {activeChild.orders.length === 0 ? (
                      <p className="text-xs text-slate-500">No fee invoices on file.</p>
                    ) : (
                      activeChild.orders.map((o) => (
                        <div
                          key={o.id}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{o.courseTitle}</p>
                            <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                              {o.invoiceNo} · {o.createdAt}
                            </p>
                          </div>
                          <span className="font-bold tabular-nums shrink-0 text-emerald-700 dark:text-emerald-400">
                            Rs. {o.amountPaidInr.toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <form
                  onSubmit={handleSendPtmRequest}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                      Request Parent-Teacher Meeting (PTM)
                    </h2>
                  </div>
                  {ptmSuccess && (
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{ptmSuccess}</span>
                    </p>
                  )}
                  <input
                    type="text"
                    value={ptmSubject}
                    onChange={(e) => setPtmSubject(e.target.value)}
                    placeholder="Subject (e.g., Request Physics progress review call)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <textarea
                    rows={2}
                    value={ptmBody}
                    onChange={(e) => setPtmBody(e.target.value)}
                    placeholder="Preferred evening time or concern..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>Send PTM Note to Faculty</span>
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
