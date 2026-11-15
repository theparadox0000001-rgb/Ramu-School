import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Hand,
  HelpCircle,
  Info,
  Mic,
  MicOff,
  MonitorUp,
  Play,
  Search,
  Send,
  Users,
  Video,
  VideoOff,
  XCircle,
} from 'lucide-react';
import type {
  LiveClassItem,
  PortalRole,
  SessionMaterialItem,
  SessionPollItem,
  SessionQuizItem,
  SessionWorkspacePayload,
  SubjectName,
} from '../types/portal';
import { PORTAL_IMAGES } from '../data/curriculumData';
import { getSessionToken, portalApi } from '../services/api';
import { TeachingBoardCanvas } from './TeachingBoardCanvas';
import { MaterialSlideViewerModal } from './MaterialSlideViewerModal';

interface LiveClassesModuleProps {
  liveClasses: LiveClassItem[];
  activeTheaterClass: LiveClassItem | null;
  onOpenTheater: (cls: LiveClassItem | null) => void;
  onToggleReminder: (id: string) => void;
  userId?: string;
  userName?: string;
  userRole?: PortalRole;
}

export const LiveClassesModule: React.FC<LiveClassesModuleProps> = ({
  liveClasses,
  activeTheaterClass,
  onOpenTheater,
  onToggleReminder,
  userId = 'IL-2027-88412',
  userName = 'Student',
  userRole = 'student',
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'upcoming' | 'recorded'>('all');
  const [subjectFilter, setSubjectFilter] = useState<'All' | SubjectName>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Live Classroom Theater state
  const [rightTab, setRightTab] = useState<'students' | 'chat' | 'materials'>('chat');
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(false);
  const [whiteboardMode, setWhiteboardMode] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [flaggedMsg, setFlaggedMsg] = useState(false);

  const [workspace, setWorkspace] = useState<SessionWorkspacePayload | null>(null);
  const [viewingMaterial, setViewingMaterial] = useState<SessionMaterialItem | null>(null);
  const [pendingSlideBg, setPendingSlideBg] = useState<{
    dataUrl: string;
    label: string;
  } | null>(null);

  const [votedOptions, setVotedOptions] = useState<Record<string, string>>({});
  const [votedSessionPolls, setVotedSessionPolls] = useState<Record<string, string>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ author: string; text: string }>>([
    {
      author: 'Priya (Student)',
      text: 'Ma’am, does the magnetic field inside a solenoid depend on its radius?',
    },
    {
      author: 'Prof. Priya Menon',
      text: 'No, for a long ideal solenoid B = μ₀nI is independent of radius and uniform across the cross-section.',
    },
  ]);

  // Hydrate full live session workspace (board, materials, polls, quizzes) + chat
  useEffect(() => {
    const classId = activeTheaterClass?.id;
    if (!classId || !getSessionToken()) {
      setWorkspace(null);
      return;
    }
    let active = true;

    portalApi
      .getLiveSessionWorkspace(classId)
      .then((ws) => {
        if (active) setWorkspace(ws);
      })
      .catch(() => undefined);

    portalApi
      .getLiveChat(classId)
      .then((res) => {
        if (active && Array.isArray(res.messages) && res.messages.length > 0) {
          setChatMessages(res.messages);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [activeTheaterClass?.id]);

  // Live WebSocket subscription for non-board events (chat, polls, quizzes, materials)
  useEffect(() => {
    const classId = activeTheaterClass?.id;
    const token = getSessionToken();
    if (!classId || !token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/classroom?classId=${encodeURIComponent(
        classId
      )}&token=${encodeURIComponent(token)}`
    );

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { type: string; payload?: any };
        if (msg.type === 'chat:new' && msg.payload) {
          const entry = msg.payload as { author: string; text: string };
          setChatMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.author === entry.author && last.text === entry.text) return prev;
            return [...prev, entry];
          });
        } else if (msg.type === 'poll:new' && msg.payload) {
          const poll = msg.payload as SessionPollItem;
          setWorkspace((prev) =>
            prev
              ? {
                  ...prev,
                  polls: prev.polls.some((p) => p.id === poll.id)
                    ? prev.polls
                    : [poll, ...prev.polls],
                }
              : prev
          );
        } else if (msg.type === 'poll:updated' && msg.payload) {
          const poll = msg.payload as SessionPollItem;
          setWorkspace((prev) =>
            prev
              ? {
                  ...prev,
                  polls: prev.polls.map((p) => (p.id === poll.id ? poll : p)),
                }
              : prev
          );
        } else if (msg.type === 'quiz:new' && msg.payload) {
          const quiz = msg.payload as SessionQuizItem;
          setWorkspace((prev) =>
            prev
              ? {
                  ...prev,
                  quizzes: prev.quizzes.some((q) => q.id === quiz.id)
                    ? prev.quizzes
                    : [quiz, ...prev.quizzes],
                }
              : prev
          );
        } else if (msg.type === 'material:new' && msg.payload) {
          const mat = msg.payload as SessionMaterialItem;
          setWorkspace((prev) =>
            prev
              ? {
                  ...prev,
                  materials: prev.materials.some((m) => m.id === mat.id)
                    ? prev.materials
                    : [...prev.materials, mat],
                }
              : prev
          );
        }
      } catch {
        // ignore malformed event
      }
    };

    return () => {
      ws.close();
    };
  }, [activeTheaterClass?.id]);

  const filteredClasses = useMemo(() => {
    return liveClasses.filter((cls) => {
      const matchStatus = statusFilter === 'all' || cls.status === statusFilter;
      const matchSubj = subjectFilter === 'All' || cls.subject === subjectFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        cls.title.toLowerCase().includes(q) ||
        cls.instructor.toLowerCase().includes(q) ||
        cls.chapter.toLowerCase().includes(q);
      return matchStatus && matchSubj && matchQuery;
    });
  }, [liveClasses, statusFilter, subjectFilter, searchQuery]);

  const handleDownloadSlides = (cls: LiveClassItem) => {
    const text = `RAMU SCHOOL — LIVE CLASS SLIDES\nSession: ${cls.title}\nFaculty: ${cls.instructor}\nSubject: ${cls.subject} · ${cls.chapter}\n\nWHITEBOARD SUMMARY:\n${cls.whiteboardNotes
      .map((n, i) => `${i + 1}. ${n}`)
      .join('\n')}\n`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cls.id}-slides.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    setChatMessages((prev) => [...prev, { author: userName, text: trimmed }]);
    setChatInput('');
    if (activeTheaterClass && getSessionToken()) {
      portalApi.sendLiveChat(activeTheaterClass.id, trimmed).catch(() => undefined);
    }
  };

  const handleVoteSessionPoll = async (pollId: string, optionId: string) => {
    if (!activeTheaterClass) return;
    setVotedSessionPolls((prev) => ({ ...prev, [pollId]: optionId }));
    try {
      const res = await portalApi.voteSessionPoll(activeTheaterClass.id, pollId, optionId);
      setWorkspace((prev) =>
        prev
          ? { ...prev, polls: prev.polls.map((p) => (p.id === pollId ? res.poll : p)) }
          : prev
      );
    } catch {
      // handled gracefully
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Live Classes & Recorded Archive
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Interactive live classrooms with faculty video, collaborative multi-slide teaching board, live polls, pop-quizzes, and slide viewer.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search faculty or topic..."
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          {([
            { id: 'all', label: 'All Sessions' },
            { id: 'live', label: 'Live Now' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'recorded', label: 'Recordings' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology'] as const).map((subj) => (
            <button
              key={subj}
              type="button"
              onClick={() => setSubjectFilter(subj)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                subjectFilter === subj
                  ? 'border-blue-700 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-200'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {subj}
            </button>
          ))}
        </div>
      </div>

      {/* Class Cards */}
      {filteredClasses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
          <Video className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            No sessions match the selected filters
          </p>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setSubjectFilter('All');
              setSearchQuery('');
            }}
            className="mt-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white cursor-pointer"
          >
            Show All Classes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredClasses.map((cls) => (
            <article
              key={cls.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-5"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {cls.subject}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{cls.gradeLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{cls.language}</span>
                  </div>
                  <span
                    className={`font-semibold tabular-nums ${
                      cls.status === 'live'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {cls.scheduledTime}
                  </span>
                </div>

                <h2 className="text-base font-bold text-slate-900 dark:text-white font-display leading-snug">
                  {cls.title}
                </h2>

                <div className="flex items-center gap-3">
                  <img
                    src={cls.instructorAvatar}
                    alt={cls.instructor}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {cls.instructor}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {cls.instructorRole}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>{cls.attendeesCount} students</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{cls.timeRange}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadSlides(cls)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Notes</span>
                  </button>

                  {cls.status === 'upcoming' && (
                    <button
                      type="button"
                      onClick={() => onToggleReminder(cls.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border cursor-pointer whitespace-nowrap ${
                        cls.reminded
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {cls.reminded ? (
                        <BellRing className="w-3.5 h-3.5" />
                      ) : (
                        <Bell className="w-3.5 h-3.5" />
                      )}
                      <span>{cls.reminded ? 'Reminder On' : 'Notify Me'}</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFlaggedMsg(false);
                    setInfoOpen(false);
                    setWhiteboardMode(true);
                    onOpenTheater(cls);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    {cls.status === 'live'
                      ? 'Join Live Classroom'
                      : cls.status === 'recorded'
                      ? 'Open Studio & Replay'
                      : 'Open Classroom Board'}
                  </span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Interactive Live Classroom Theater Modal */}
      {activeTheaterClass && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeTheaterClass.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto"
        >
          <div className="w-full max-w-7xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden my-auto shadow-2xl">
            {/* Classroom Top Bar */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-4 min-w-0">
                <span className="text-xs font-bold tracking-tight text-blue-700 dark:text-blue-400 pr-4 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">
                  Ramu School · Live Classroom
                </span>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate font-display">
                  {activeTheaterClass.title}
                </h3>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 relative">
                <button
                  type="button"
                  aria-label="Session info"
                  onClick={() => setInfoOpen(!infoOpen)}
                  className="w-9 h-9 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Info className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  aria-label="Report audio or video issue"
                  onClick={() => setFlaggedMsg(!flaggedMsg)}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer ${
                    flaggedMsg
                      ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Flag className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onOpenTheater(null)}
                  className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold tracking-wide cursor-pointer whitespace-nowrap"
                >
                  LEAVE CLASS
                </button>

                {infoOpen && (
                  <div className="absolute right-0 top-12 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-lg z-20 text-xs space-y-1.5">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {activeTheaterClass.subject} · {activeTheaterClass.gradeLabel}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Faculty: {activeTheaterClass.instructor}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      Schedule: {activeTheaterClass.timeRange} ({activeTheaterClass.language})
                    </p>
                  </div>
                )}
              </div>
            </div>

            {flaggedMsg && (
              <div className="px-5 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                Stream quality feedback logged for faculty tech support.
              </div>
            )}

            {/* Main Classroom Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Left Stage: Production Teaching Board OR Faculty Video */}
              <div
                className={`${
                  panelCollapsed ? 'lg:col-span-12' : 'lg:col-span-8 xl:col-span-9'
                } p-4 flex flex-col justify-between gap-3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40`}
              >
                <div className="relative rounded-2xl overflow-hidden">
                  {whiteboardMode ? (
                    <TeachingBoardCanvas
                      liveClassId={activeTheaterClass.id}
                      sessionTitle={activeTheaterClass.title}
                      userId={userId}
                      userName={userName}
                      userRole={userRole}
                      initialBoard={workspace?.board}
                      materials={workspace?.materials || []}
                      externalSlideBackground={pendingSlideBg}
                      onClearExternalSlideBackground={() => setPendingSlideBg(null)}
                    />
                  ) : (
                    <div className="rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900 p-8 min-h-[460px] flex items-center justify-center">
                      <div className="flex flex-col sm:flex-row items-center gap-6 max-w-xl">
                        <img
                          src={activeTheaterClass.instructorAvatar}
                          alt={activeTheaterClass.instructor}
                          referrerPolicy="no-referrer"
                          className="w-44 h-44 sm:w-52 sm:h-52 rounded-2xl object-cover border-2 border-white dark:border-slate-700 shadow-md"
                        />
                        <div className="space-y-2.5 text-center sm:text-left">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                            {activeTheaterClass.instructor}
                          </p>
                          <p className="text-lg font-bold text-slate-900 dark:text-white font-display">
                            {activeTheaterClass.chapter}
                          </p>
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            {activeTheaterClass.whiteboardNotes[0]}
                          </p>
                          <button
                            type="button"
                            onClick={() => setWhiteboardMode(true)}
                            className="mt-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            Switch to Live Teaching Board
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapse/Expand Side Panel Button */}
                  <button
                    type="button"
                    aria-label={panelCollapsed ? 'Show classroom panel' : 'Hide classroom panel'}
                    onClick={() => setPanelCollapsed(!panelCollapsed)}
                    className="hidden lg:flex absolute right-3 top-14 w-8 h-8 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center text-slate-700 dark:text-slate-200 shadow cursor-pointer z-20"
                  >
                    {panelCollapsed ? (
                      <ChevronLeft className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Bottom Classroom Control Dock */}
                <div className="flex items-center justify-center gap-3 flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={() => setCamEnabled(!camEnabled)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      camEnabled
                        ? 'bg-blue-700 text-white hover:bg-blue-800'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {camEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    <span>{camEnabled ? 'Camera On' : 'Camera Off'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMicEnabled(!micEnabled)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      micEnabled
                        ? 'bg-blue-700 text-white hover:bg-blue-800'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    <span>{micEnabled ? 'Mic On' : 'Muted'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWhiteboardMode(!whiteboardMode)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      whiteboardMode
                        ? 'border-blue-700 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-200'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <MonitorUp className="w-4 h-4" />
                    <span>{whiteboardMode ? 'Faculty Video View' : 'Teaching Board'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHandRaised(!handRaised)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      handRaised
                        ? 'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                        : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                    }`}
                  >
                    <Hand className="w-4 h-4" />
                    <span>{handRaised ? 'Hand Raised' : 'Raise Hand'}</span>
                  </button>
                </div>
              </div>

              {/* Right Side Panel: CHAT & POLL | SLIDES | STUDENTS */}
              {!panelCollapsed && (
                <div className="lg:col-span-4 xl:col-span-3 flex flex-col justify-between bg-white dark:bg-slate-900 max-h-[680px]">
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="grid grid-cols-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() => setRightTab('chat')}
                        className={`py-3 text-[11px] font-bold tracking-wide border-b-2 transition-colors cursor-pointer ${
                          rightTab === 'chat'
                            ? 'border-blue-700 text-blue-700 dark:text-blue-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        CHAT & POLL
                      </button>
                      <button
                        type="button"
                        onClick={() => setRightTab('materials')}
                        className={`py-3 text-[11px] font-bold tracking-wide border-b-2 transition-colors cursor-pointer ${
                          rightTab === 'materials'
                            ? 'border-blue-700 text-blue-700 dark:text-blue-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        SLIDES ({workspace?.materials.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRightTab('students')}
                        className={`py-3 text-[11px] font-bold tracking-wide border-b-2 transition-colors cursor-pointer ${
                          rightTab === 'students'
                            ? 'border-blue-700 text-blue-700 dark:text-blue-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        CLASS ({activeTheaterClass.attendeesCount})
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {rightTab === 'students' && (
                        <div className="space-y-3">
                          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-950 relative">
                            {camEnabled ? (
                              <img
                                src={PORTAL_IMAGES.avatarStudent}
                                alt="Your classroom camera"
                                referrerPolicy="no-referrer"
                                className="w-full h-32 object-cover"
                              />
                            ) : (
                              <div className="w-full h-32 flex items-center justify-center text-lg font-bold text-slate-500">
                                {userName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="px-3 py-1.5 bg-slate-900/80 text-white text-xs flex items-center justify-between">
                              <span>
                                {userName} (You){handRaised ? ' · Hand Raised' : ''}
                              </span>
                              <span>{micEnabled ? 'Mic On' : 'Muted'}</span>
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center justify-center">
                                RM
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                                  Ramesh M.
                                </p>
                                <p className="text-[11px] text-slate-500">Camera Off · Muted</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {rightTab === 'materials' && (
                        <div className="space-y-3">
                          {(workspace?.materials || []).length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-6">
                              No session slide decks uploaded yet.
                            </p>
                          ) : (
                            (workspace?.materials || []).map((mat) => (
                              <button
                                key={mat.id}
                                type="button"
                                onClick={() => setViewingMaterial(mat)}
                                className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-600 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2 cursor-pointer text-xs"
                              >
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                                    {mat.title}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {mat.fileType} · {mat.pages.length || 1} Page(s)
                                  </p>
                                </div>
                                <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                              </button>
                            ))
                          )}
                        </div>
                      )}

                      {rightTab === 'chat' && (
                        <div className="space-y-3.5">
                          {/* Teacher-Pushed Live Polls */}
                          {(workspace?.polls || []).map((sp) => {
                            const userChoice = votedSessionPolls[sp.id];
                            const totalVotes = sp.options.reduce((a, o) => a + o.votes, 0);
                            return (
                              <div
                                key={sp.id}
                                className="rounded-xl border border-sky-200 dark:border-sky-900 p-3 space-y-2 bg-sky-50/50 dark:bg-sky-950/30"
                              >
                                <p className="text-[11px] font-bold text-sky-700 dark:text-sky-400">
                                  Live Faculty Poll
                                </p>
                                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                                  {sp.prompt}
                                </p>
                                <div className="space-y-1.5">
                                  {sp.options.map((opt) => {
                                    const pct =
                                      totalVotes > 0
                                        ? Math.round((opt.votes / totalVotes) * 100)
                                        : 0;
                                    const selected = userChoice === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => void handleVoteSessionPoll(sp.id, opt.id)}
                                        className={`w-full text-left p-2 rounded-lg border text-xs cursor-pointer flex justify-between ${
                                          selected
                                            ? 'border-blue-700 bg-blue-100/70 dark:bg-blue-900/40 dark:border-blue-500'
                                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                                        }`}
                                      >
                                        <span>{opt.label}</span>
                                        {(userChoice || totalVotes > 0) && (
                                          <span className="font-mono tabular-nums">{pct}%</span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Teacher-Pushed Live Pop Quizzes */}
                          {(workspace?.quizzes || []).map((qz) => {
                            const picked = quizAnswers[qz.id];
                            const hasPicked = picked !== undefined;
                            return (
                              <div
                                key={qz.id}
                                className="rounded-xl border border-indigo-200 dark:border-indigo-900 p-3 space-y-2 bg-indigo-50/50 dark:bg-indigo-950/30"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1">
                                    <HelpCircle className="w-3.5 h-3.5" />
                                    <span>{qz.title}</span>
                                  </span>
                                  <span className="font-mono text-slate-500">{qz.durationSec}s</span>
                                </div>
                                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                                  {qz.prompt}
                                </p>
                                <div className="space-y-1">
                                  {qz.options.map((optText, oIdx) => {
                                    const isCorrect = oIdx === qz.correctIndex;
                                    const isPicked = picked === oIdx;
                                    return (
                                      <button
                                        key={oIdx}
                                        type="button"
                                        disabled={hasPicked}
                                        onClick={() =>
                                          setQuizAnswers((prev) => ({ ...prev, [qz.id]: oIdx }))
                                        }
                                        className={`w-full text-left p-2 rounded-lg border text-xs flex items-center justify-between gap-2 cursor-pointer ${
                                          hasPicked
                                            ? isCorrect
                                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                                              : isPicked
                                              ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
                                              : 'border-slate-200 dark:border-slate-800 opacity-60'
                                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500'
                                        }`}
                                      >
                                        <span>{optText}</span>
                                        {hasPicked && isCorrect && (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        )}
                                        {hasPicked && isPicked && !isCorrect && (
                                          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Fallback Class Poll if no custom session polls yet */}
                          {(workspace?.polls || []).length === 0 && (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2 bg-slate-50 dark:bg-slate-950">
                              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                                Live Concept Poll
                              </p>
                              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                                {activeTheaterClass.pollQuestion.prompt}
                              </p>
                              <div className="space-y-1.5">
                                {(() => {
                                  const userChoice = votedOptions[activeTheaterClass.id];
                                  const totalVotes =
                                    activeTheaterClass.pollQuestion.options.reduce(
                                      (a, o) => a + o.votes,
                                      0
                                    ) + (userChoice ? 1 : 0);
                                  return activeTheaterClass.pollQuestion.options.map((opt) => {
                                    const votes = opt.votes + (userChoice === opt.id ? 1 : 0);
                                    const pct =
                                      totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                                    const isSelected = userChoice === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                          setVotedOptions((prev) => ({
                                            ...prev,
                                            [activeTheaterClass.id]: opt.id,
                                          }));
                                          if (getSessionToken()) {
                                            portalApi
                                              .voteLivePoll(activeTheaterClass.id, opt.id)
                                              .catch(() => undefined);
                                          }
                                        }}
                                        className={`w-full text-left p-2 rounded-lg border text-xs cursor-pointer ${
                                          isSelected
                                            ? 'border-blue-700 bg-blue-50 dark:bg-blue-950/50 dark:border-blue-500'
                                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                                        }`}
                                      >
                                        <div className="flex justify-between font-medium">
                                          <span>{opt.label}</span>
                                          {userChoice && (
                                            <span className="font-mono tabular-nums">{pct}%</span>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}

                          {/* Chat Messages */}
                          <div className="space-y-2">
                            {chatMessages.map((msg, i) => (
                              <div
                                key={i}
                                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-0.5"
                              >
                                <p className="font-semibold text-slate-900 dark:text-white">
                                  {msg.author}
                                </p>
                                <p className="text-slate-600 dark:text-slate-300">{msg.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chat Composer */}
                  <form
                    onSubmit={handleSendChat}
                    className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask a question in class chat..."
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="submit"
                      aria-label="Send class chat message"
                      onClick={() => setRightTab('chat')}
                      className="p-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dark Material / Slide Viewer Modal */}
      {viewingMaterial && (
        <MaterialSlideViewerModal
          material={viewingMaterial}
          onClose={() => setViewingMaterial(null)}
          onAnnotateSlide={(dataUrl, label) => {
            setViewingMaterial(null);
            setWhiteboardMode(true);
            setPendingSlideBg({ dataUrl, label });
          }}
        />
      )}
    </div>
  );
};
