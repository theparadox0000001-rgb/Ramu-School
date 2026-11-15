import React, { useCallback, useEffect, useState } from 'react';
import { LogOut, RefreshCw, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import type { ActiveSessionInfo, ExamTrack, StudentProfile } from '../types/portal';
import { portalApi } from '../services/api';

interface ProfileModalProps {
  student: StudentProfile;
  onClose: () => void;
  onSaveProfile: (updated: StudentProfile) => void;
  onSignOut: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  student,
  onClose,
  onSaveProfile,
  onSignOut,
}) => {
  const [modalTab, setModalTab] = useState<'profile' | 'sessions'>('profile');
  const [name, setName] = useState(student.name);
  const [track, setTrack] = useState<ExamTrack>(student.track);
  const [grade, setGrade] = useState(student.grade);
  const [dailyGoalHours, setDailyGoalHours] = useState(student.dailyGoalHours);

  const [sessions, setSessions] = useState<ActiveSessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionMsg, setSessionMsg] = useState('');

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionMsg('');
    try {
      const data = await portalApi.getSessions();
      setSessions(data.sessions);
    } catch {
      setSessionMsg('Active session directory requires live server authentication.');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (modalTab === 'sessions') {
      void loadSessions();
    }
  }, [modalTab, loadSessions]);

  const handleRevokeSession = async (prefix: string) => {
    try {
      await portalApi.revokeSession(prefix);
      setSessions((prev) => prev.filter((s) => s.tokenPrefix !== prefix));
      setSessionMsg(`Revoked device session ${prefix}...`);
    } catch (err) {
      setSessionMsg(err instanceof Error ? err.message : 'Unable to revoke session.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      ...student,
      name: name.trim() || student.name,
      track,
      grade,
      dailyGoalHours,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Account Settings & Security"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
            Account Preferences & Security
          </h2>
          <button
            type="button"
            aria-label="Close profile modal"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
            <button
              type="button"
              onClick={() => setModalTab('profile')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                modalTab === 'profile'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Profile & Goals
            </button>
            <button
              type="button"
              onClick={() => setModalTab('sessions')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                modalTab === 'sessions'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Security & Devices</span>
            </button>
          </div>
        </div>

        {modalTab === 'profile' ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="flex items-center gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
              <img
                src={student.avatarUrl}
                alt={student.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
              />
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</p>
                <p className="font-mono">ID: {student.admissionId}</p>
                <p>
                  Signed in via {student.loginMethod.toUpperCase()} · {student.phone}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Target Exam Track
                </label>
                <select
                  value={track}
                  onChange={(e) => setTrack(e.target.value as ExamTrack)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="IIT-JEE">IIT-JEE</option>
                  <option value="NEET UG">NEET UG</option>
                  <option value="CBSE Class 12">CBSE Class 12</option>
                  <option value="CBSE Grade 10">CBSE Grade 10</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Grade / Batch
                </label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option>Class 10</option>
                  <option>Class 11</option>
                  <option>Class 12</option>
                  <option>Dropper / Repeater</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Daily Study Goal (Hours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={dailyGoalHours}
                  onChange={(e) => setDailyGoalHours(Number(e.target.value) || 4)}
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Active Authenticated Devices ({sessions.length})
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Revoke any unfamiliar session token immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadSessions()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sessionsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {sessionMsg && (
              <p className="text-xs text-blue-700 dark:text-blue-400">{sessionMsg}</p>
            )}

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
              {sessions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  {sessionsLoading ? 'Loading active sessions...' : 'No active sessions listed.'}
                </div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.tokenPrefix}
                    className="p-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-slate-900 dark:text-white">
                        Token {s.tokenPrefix}… · {s.loginMethod.toUpperCase()}
                        {s.isCurrent ? ' (Current Device)' : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        Started: {s.createdAt} · Expires: {s.expiresAt}
                      </p>
                    </div>
                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => void handleRevokeSession(s.tokenPrefix)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revoke</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
