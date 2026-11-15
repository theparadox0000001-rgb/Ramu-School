import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Atom,
  BarChart3,
  BookOpen,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Dna,
  Download,
  FileText,
  Globe,
  GraduationCap,
  HelpCircle,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Play,
  Plus,
  Send,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import type {
  LiveClassItem,
  SessionClassworkSnapshot,
  SessionMaterialItem,
  SessionPollItem,
  SessionQuizItem,
  SessionWorkspacePayload,
  TeacherAssignment,
} from '../types/portal';
import { getSessionToken, portalApi } from '../services/api';
import { MaterialSlideViewerModal } from './MaterialSlideViewerModal';
import { TeachingBoardCanvas } from './TeachingBoardCanvas';

interface TeacherSessionDetailViewProps {
  liveClass: LiveClassItem;
  facultyId: string;
  facultyName: string;
  assignments: TeacherAssignment[];
  onBack: () => void;
}

type DetailTab =
  | 'material'
  | 'about'
  | 'engagement'
  | 'students'
  | 'assignment'
  | 'classwork';

export const TeacherSessionDetailView: React.FC<TeacherSessionDetailViewProps> = ({
  liveClass,
  facultyId,
  facultyName,
  assignments,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('material');
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<SessionWorkspacePayload | null>(null);

  // Slide Viewer & Annotate-on-Board handoff
  const [viewingMaterial, setViewingMaterial] = useState<SessionMaterialItem | null>(null);
  const [pendingSlideBg, setPendingSlideBg] = useState<{
    dataUrl: string;
    label: string;
  } | null>(null);

  // Create modals
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollPrompt, setPollPrompt] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState('True\nFalse\nNeeds Recap');

  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizTitle, setQuizTitle] = useState('Quick Concept Check');
  const [quizPrompt, setQuizPrompt] = useState('');
  const [quizOpt0, setQuizOpt0] = useState('');
  const [quizOpt1, setQuizOpt1] = useState('');
  const [quizOpt2, setQuizOpt2] = useState('');
  const [quizOpt3, setQuizOpt3] = useState('');
  const [quizCorrectIdx, setQuizCorrectIdx] = useState(0);
  const [quizDuration, setQuizDuration] = useState(60);

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [matCategory, setMatCategory] = useState<'note' | 'material'>('material');
  const [matTitle, setMatTitle] = useState('');
  const [matFileType, setMatFileType] = useState<SessionMaterialItem['fileType']>('PDF');
  const [matSummary, setMatSummary] = useState('');
  const [matFormula, setMatFormula] = useState('');

  // Live Educator Classroom Theater state
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [theaterRightTab, setTheaterRightTab] = useState<'polls' | 'students' | 'chat'>('polls');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ author: string; text: string }>>([]);

  const fetchWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const data = await portalApi.getLiveSessionWorkspace(liveClass.id);
      setWorkspace(data);
    } catch {
      setWorkspace({
        liveClass,
        objectives:
          liveClass.whiteboardNotes.length > 0
            ? liveClass.whiteboardNotes
            : [`Student will learn about ${liveClass.chapter}`],
        about: {
          exam: liveClass.track,
          chapter: `${liveClass.chapter} · ${liveClass.subject} (${liveClass.gradeLabel})`,
          topic: liveClass.title,
          subTopic: 'Core Concepts & Problem Solving',
          program: `${liveClass.track} Comprehensive`,
          batch: `RS-${liveClass.subject.slice(0, 3).toUpperCase()}-27 || ${liveClass.timeRange} || ${liveClass.language}`,
          durationMin: 55,
        },
        materials: [],
        polls: [],
        quizzes: [],
        classwork: [],
        board: {
          liveClassId: liveClass.id,
          allowStudentDraw: false,
          activeSlideIndex: 0,
          slides: [
            {
              id: `slide-${liveClass.id}-1`,
              title: `${liveClass.title} — Slide 1`,
              theme: 'blackboard',
              grid: 'grid',
              elements: [],
            },
          ],
          updatedAt: new Date().toISOString(),
        },
        roster: [],
      });
    } finally {
      setLoading(false);
    }
  }, [liveClass]);

  useEffect(() => {
    void fetchWorkspace();
  }, [fetchWorkspace]);

  useEffect(() => {
    if (!theaterOpen || !getSessionToken()) return;
    portalApi
      .getLiveChat(liveClass.id)
      .then((res) => {
        if (Array.isArray(res.messages)) setChatMessages(res.messages);
      })
      .catch(() => undefined);
  }, [theaterOpen, liveClass.id]);

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const opts = pollOptionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pollPrompt.trim() || opts.length < 2) return;
    try {
      const res = await portalApi.createSessionPoll(liveClass.id, {
        prompt: pollPrompt.trim(),
        options: opts,
      });
      setWorkspace((prev) => (prev ? { ...prev, polls: [res.poll, ...prev.polls] } : prev));
      setPollPrompt('');
      setPollModalOpen(false);
    } catch {
      // handled gracefully
    }
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizPrompt.trim() || !quizOpt0.trim() || !quizOpt1.trim() || !quizOpt2.trim() || !quizOpt3.trim()) {
      return;
    }
    try {
      const res = await portalApi.createSessionQuiz(liveClass.id, {
        title: quizTitle.trim() || 'Live Pop Quiz',
        prompt: quizPrompt.trim(),
        options: [quizOpt0.trim(), quizOpt1.trim(), quizOpt2.trim(), quizOpt3.trim()],
        correctIndex: quizCorrectIdx,
        durationSec: quizDuration,
      });
      setWorkspace((prev) => (prev ? { ...prev, quizzes: [res.quiz, ...prev.quizzes] } : prev));
      setQuizPrompt('');
      setQuizOpt0('');
      setQuizOpt1('');
      setQuizOpt2('');
      setQuizOpt3('');
      setQuizModalOpen(false);
    } catch {
      // handled gracefully
    }
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matTitle.trim()) return;
    try {
      const res = await portalApi.createSessionMaterial(liveClass.id, {
        category: matCategory,
        title: matTitle.trim(),
        fileType: matFileType,
        summary: matSummary.trim(),
        keyFormula: matFormula.trim() || undefined,
      });
      setWorkspace((prev) =>
        prev ? { ...prev, materials: [...prev.materials, res.material] } : prev
      );
      setMatTitle('');
      setMatSummary('');
      setMatFormula('');
      setMaterialModalOpen(false);
    } catch {
      // handled gracefully
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    setChatMessages((prev) => [...prev, { author: `${facultyName} (Faculty)`, text: trimmed }]);
    setChatInput('');
    if (getSessionToken()) {
      portalApi.sendLiveChat(liveClass.id, trimmed).catch(() => undefined);
    }
  };

  const notesList = (workspace?.materials || []).filter((m) => m.category === 'note');
  const classMaterialsList = (workspace?.materials || []).filter((m) => m.category === 'material');
  const polls: SessionPollItem[] = workspace?.polls || [];
  const quizzes: SessionQuizItem[] = workspace?.quizzes || [];
  const classwork: SessionClassworkSnapshot[] = workspace?.classwork || [];
  const roster = workspace?.roster || [];
  const relatedAssignments = assignments.filter(
    (a) => a.subject.toLowerCase() === liveClass.subject.toLowerCase()
  );

  const totalVotes = polls.reduce(
    (sum, p) => sum + p.options.reduce((s, o) => s + o.votes, 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Session Header Card matching PDF 1 & PDF 2 */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#fdfaf1] dark:bg-slate-900 p-6 space-y-5 relative overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Sessions</span>
            </button>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-display">
              {liveClass.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setTheaterOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold tracking-wider uppercase shadow-sm cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>JOIN NOW</span>
              </button>

              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 tabular-nums">
                {liveClass.dateLabel} | {liveClass.timeRange} (IST)
              </span>
            </div>
          </div>

          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 border ${
              liveClass.subject === 'Biology'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-sky-500/15 border-sky-500/30 text-sky-600 dark:text-sky-400'
            }`}
          >
            {liveClass.subject === 'Biology' ? (
              <Dna className="w-7 h-7" />
            ) : (
              <Atom className="w-7 h-7" />
            )}
          </div>
        </div>

        {/* 4 Metadata Grid Cells matching PDF layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-amber-200/80 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 px-3.5 py-2.5 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="uppercase">{liveClass.subject} · ONLINE</span>
          </div>
          <div className="rounded-lg border border-amber-200/80 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 px-3.5 py-2.5 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
            <GraduationCap className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="uppercase">{liveClass.gradeLabel}</span>
          </div>
          <div className="rounded-lg border border-amber-200/80 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 px-3.5 py-2.5 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{workspace?.about.durationMin || 55} MINUTES</span>
          </div>
          <div className="rounded-lg border border-amber-200/80 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 px-3.5 py-2.5 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
            <Globe className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="uppercase">{liveClass.language}</span>
          </div>
        </div>
      </div>

      {/* 6 Underline Navigation Tabs matching PDFs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-6 overflow-x-auto">
        {(
          [
            { id: 'material', label: 'LESSON MATERIAL' },
            { id: 'about', label: 'ABOUT' },
            { id: 'engagement', label: 'ENGAGEMENT' },
            { id: 'students', label: `STUDENTS(${roster.length})` },
            { id: 'assignment', label: 'ASSIGNMENT' },
            { id: 'classwork', label: `CLASSWORK(${classwork.length})` },
          ] as Array<{ id: DetailTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-xs font-bold tracking-wide border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'border-sky-600 text-sky-700 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading session workspace...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: LESSON MATERIAL */}
          {activeTab === 'material' && workspace && (
            <div className="space-y-6">
              {/* Objectives of the session */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Objectives of the session
                </h2>
                <ul className="space-y-1.5">
                  {workspace.objectives.map((obj, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-600 mt-2 shrink-0" />
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* POLLS */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">
                    POLLS ({polls.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setPollModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>CREATE</span>
                  </button>
                </div>

                {polls.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No live concept polls created yet. Click + CREATE to launch an instant classroom poll.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {polls.map((poll) => {
                      const pTotal = poll.options.reduce((s, o) => s + o.votes, 0);
                      return (
                        <div
                          key={poll.id}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {poll.prompt}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                              {poll.status}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {poll.options.map((opt) => (
                              <div
                                key={opt.id}
                                className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300"
                              >
                                <span>{opt.label}</span>
                                <span className="font-mono tabular-nums">
                                  {opt.votes} ({pTotal > 0 ? Math.round((opt.votes / pTotal) * 100) : 0}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* QUIZ */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">
                    QUIZ ({quizzes.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setQuizModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>CREATE</span>
                  </button>
                </div>

                {quizzes.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No timed quizzes added yet. Click + CREATE to push a 4-option MCQ pop-quiz to students.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {quizzes.map((qz) => (
                      <div
                        key={qz.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-sky-700 dark:text-sky-400">
                            {qz.title}
                          </span>
                          <span className="font-mono text-slate-500">{qz.durationSec}s</span>
                        </div>
                        <p className="text-xs font-medium text-slate-900 dark:text-white">
                          {qz.prompt}
                        </p>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                          Answer Key: {qz.options[qz.correctIndex]}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* NOTES */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">
                    NOTES ({notesList.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setMatCategory('note');
                      setMaterialModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ADD NOTE</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {notesList.map((mat) => (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => setViewingMaterial(mat)}
                      className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-sky-600 transition-colors overflow-hidden cursor-pointer group"
                    >
                      <div className="h-36 bg-slate-50 dark:bg-slate-900 flex items-center justify-center border-b border-slate-200 dark:border-slate-800">
                        <FileText className="w-12 h-12 text-slate-700 dark:text-slate-300 group-hover:text-sky-600 transition-colors" />
                      </div>
                      <div className="p-3 flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {mat.title}
                        </span>
                        <span className="text-sky-600 font-semibold shrink-0">View</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* CLASS MATERIAL */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xs font-bold tracking-wider uppercase text-slate-700 dark:text-slate-200">
                      CLASS MATERIAL ({classMaterialsList.length})
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Add your presentations, video, audio and documents here
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMatCategory('material');
                      setMaterialModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ADD</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {classMaterialsList.map((mat) => (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => setViewingMaterial(mat)}
                      className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-sky-600 transition-colors overflow-hidden cursor-pointer group"
                    >
                      <div className="h-36 bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center gap-2 border-b border-slate-200 dark:border-slate-800">
                        <div className="w-11 h-11 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center text-sm shadow">
                          {mat.fileType}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {mat.pages.length || 1} Page(s) · Click to Present
                        </span>
                      </div>
                      <div className="p-3 flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {mat.title}
                        </span>
                        <span className="text-sky-600 font-semibold shrink-0">Open</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: ABOUT (Matching PDF 2 verbatim) */}
          {activeTab === 'about' && workspace && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Exam</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {workspace.about.exam}
                  </p>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="pb-2.5 pr-4 font-semibold">Chapter</th>
                        <th className="pb-2.5 pr-4 font-semibold">Topic</th>
                        <th className="pb-2.5 font-semibold">Sub Topic</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-slate-900 dark:text-slate-100 font-medium">
                        <td className="py-2 pr-4">{workspace.about.chapter}</td>
                        <td className="py-2 pr-4">{workspace.about.topic}</td>
                        <td className="py-2">{workspace.about.subTopic}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Associated Program and Batch
                </h2>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-sky-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Program</th>
                        <th className="py-3 px-4 font-semibold">Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                        <td className="py-3.5 px-4 font-medium">{workspace.about.program}</td>
                        <td className="py-3.5 px-4 font-mono">{workspace.about.batch}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: ENGAGEMENT */}
          {activeTab === 'engagement' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
              {[
                { label: 'Active Polls', val: polls.length, icon: BarChart3 },
                { label: 'Total Poll Votes', val: totalVotes, icon: CheckCircle2 },
                { label: 'Pop Quizzes Pushed', val: quizzes.length, icon: HelpCircle },
                { label: 'Board Classwork Saved', val: classwork.length, icon: Camera },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2"
                  >
                    <Icon className="w-5 h-5 text-sky-600" />
                    <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                      {stat.val}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 4: STUDENTS(N) */}
          {activeTab === 'students' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
              {roster.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Students will appear here as they join this session cohort.
                </div>
              ) : (
                roster.map((stu) => (
                  <div
                    key={stu.id}
                    className="px-6 py-3.5 flex items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{stu.name}</p>
                      <p className="font-mono text-slate-500">{stu.rollNo}</p>
                    </div>
                    <span
                      className={`font-semibold ${
                        stu.status === 'Present'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : stu.status === 'Late'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {stu.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 5: ASSIGNMENT */}
          {activeTab === 'assignment' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
              {relatedAssignments.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No assignments linked specifically to {liveClass.subject} yet.
                </div>
              ) : (
                relatedAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="p-5 flex items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-white">{a.title}</p>
                      <p className="text-slate-500 mt-0.5">
                        {a.gradeLabel} · Due {a.dueDate}
                      </p>
                    </div>
                    <span className="font-mono font-semibold tabular-nums">
                      {a.submittedCount}/{a.totalStudents} Submitted
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 6: CLASSWORK */}
          {activeTab === 'classwork' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Annotated whiteboards and chalkboard snapshots saved during live teaching.
                </p>
                <button
                  type="button"
                  onClick={() => setTheaterOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Open Board & Capture Classwork
                </button>
              </div>

              {classwork.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-2">
                  <Camera className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    No board snapshots saved yet
                  </p>
                  <p className="text-xs text-slate-500">
                    Click JOIN NOW and press &ldquo;Save Classwork&rdquo; on the teaching board to archive board notes for students.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {classwork.map((cw) => (
                    <div
                      key={cw.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                    >
                      <img
                        src={cw.imageDataUrl}
                        alt={cw.title}
                        className="w-full aspect-video object-cover bg-slate-950 border-b border-slate-200 dark:border-slate-800"
                      />
                      <div className="p-4 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{cw.title}</p>
                          <p className="text-slate-500">
                            Saved by {cw.savedBy} · {cw.slideTitle}
                          </p>
                        </div>
                        <a
                          href={cw.imageDataUrl}
                          download={`${cw.id}.png`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PNG</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Slide / PDF Dark Viewer Modal */}
      {viewingMaterial && (
        <MaterialSlideViewerModal
          material={viewingMaterial}
          onClose={() => setViewingMaterial(null)}
          onAnnotateSlide={(dataUrl, label) => {
            setViewingMaterial(null);
            setPendingSlideBg({ dataUrl, label });
            setTheaterOpen(true);
          }}
        />
      )}

      {/* Create Poll Modal */}
      {pollModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <form
            onSubmit={handleCreatePoll}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold font-display">Create Classroom Poll</h3>
              <button
                type="button"
                onClick={() => setPollModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Question Prompt</label>
              <input
                type="text"
                required
                value={pollPrompt}
                onChange={(e) => setPollPrompt(e.target.value)}
                placeholder="e.g., Which organism acts as secondary consumer in this food web?"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Options (one per line)</label>
              <textarea
                rows={4}
                required
                value={pollOptionsText}
                onChange={(e) => setPollOptionsText(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPollModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
              >
                Launch Live Poll
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Quiz Modal */}
      {quizModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <form
            onSubmit={handleCreateQuiz}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold font-display">Create Timed Pop-Quiz</h3>
              <button
                type="button"
                onClick={() => setQuizModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Quiz Title</label>
                <input
                  type="text"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Duration (sec)</label>
                <input
                  type="number"
                  min={15}
                  value={quizDuration}
                  onChange={(e) => setQuizDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Question</label>
              <input
                type="text"
                required
                value={quizPrompt}
                onChange={(e) => setQuizPrompt(e.target.value)}
                placeholder="Enter MCQ question..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="Option A"
                value={quizOpt0}
                onChange={(e) => setQuizOpt0(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                required
                placeholder="Option B"
                value={quizOpt1}
                onChange={(e) => setQuizOpt1(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                required
                placeholder="Option C"
                value={quizOpt2}
                onChange={(e) => setQuizOpt2(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                required
                placeholder="Option D"
                value={quizOpt3}
                onChange={(e) => setQuizOpt3(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Correct Option</label>
              <select
                value={quizCorrectIdx}
                onChange={(e) => setQuizCorrectIdx(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value={0}>Option A</option>
                <option value={1}>Option B</option>
                <option value={2}>Option C</option>
                <option value={3}>Option D</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuizModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
              >
                Save & Push Quiz
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Material / Notes Modal */}
      {materialModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <form
            onSubmit={handleCreateMaterial}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold font-display">
                Add {matCategory === 'note' ? 'Session Notes' : 'Class Material'}
              </h3>
              <button
                type="button"
                onClick={() => setMaterialModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Category</label>
                <select
                  value={matCategory}
                  onChange={(e) => setMatCategory(e.target.value as 'note' | 'material')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="material">Class Material</option>
                  <option value="note">Notes</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">File Format</label>
                <select
                  value={matFileType}
                  onChange={(e) =>
                    setMatFileType(e.target.value as SessionMaterialItem['fileType'])
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="PDF">PDF</option>
                  <option value="PPTX">PPTX</option>
                  <option value="DOC">DOC</option>
                  <option value="VIDEO">VIDEO</option>
                  <option value="AUDIO">AUDIO</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Document / Slide Title</label>
              <input
                type="text"
                required
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
                placeholder="e.g., G8-Bio-FoodWeb-Diagram.pdf"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Slide Bullet Points (one per line)</label>
              <textarea
                rows={4}
                value={matSummary}
                onChange={(e) => setMatSummary(e.target.value)}
                placeholder="Key teaching concept 1&#10;Key teaching concept 2"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Key Formula / Principle (Optional)</label>
              <input
                type="text"
                value={matFormula}
                onChange={(e) => setMatFormula(e.target.value)}
                placeholder="e.g., 10% Energy Transfer Rule"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMaterialModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
              >
                Add to Session
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Full Educator Live Classroom Theater Modal (JOIN NOW) */}
      {theaterOpen && workspace && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Live Teaching Studio: ${liveClass.title}`}
          className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white"
        >
          {/* Educator Studio Header */}
          <header className="h-14 px-4 sm:px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-bold text-sky-400 pr-3 border-r border-slate-700 whitespace-nowrap">
                Ramu School · Educator Studio
              </span>
              <h2 className="text-sm font-bold truncate">{liveClass.title}</h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCamOn(!camOn)}
                className={`p-2 rounded-lg text-xs cursor-pointer ${
                  camOn ? 'bg-slate-800 text-white' : 'bg-rose-900/50 text-rose-300'
                }`}
                title={camOn ? 'Camera On' : 'Camera Off'}
              >
                {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setMicOn(!micOn)}
                className={`p-2 rounded-lg text-xs cursor-pointer ${
                  micOn ? 'bg-slate-800 text-white' : 'bg-rose-900/50 text-rose-300'
                }`}
                title={micOn ? 'Mic On' : 'Mic Muted'}
              >
                {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setTheaterOpen(false)}
                className="px-4 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                END / LEAVE
              </button>
            </div>
          </header>

          {/* Main Split: Teaching Board Studio + Right Faculty Dock */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-9 p-3 sm:p-4 overflow-y-auto bg-slate-950">
              <TeachingBoardCanvas
                liveClassId={liveClass.id}
                sessionTitle={liveClass.title}
                userId={facultyId}
                userName={facultyName}
                userRole="teacher"
                initialBoard={workspace.board}
                materials={workspace.materials}
                externalSlideBackground={pendingSlideBg}
                onClearExternalSlideBackground={() => setPendingSlideBg(null)}
                onSaveClasswork={(snap) =>
                  setWorkspace((prev) =>
                    prev ? { ...prev, classwork: [snap, ...prev.classwork] } : prev
                  )
                }
              />
            </div>

            <aside className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
              <div className="grid grid-cols-3 border-b border-slate-800 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setTheaterRightTab('polls')}
                  className={`py-2.5 border-b-2 cursor-pointer ${
                    theaterRightTab === 'polls'
                      ? 'border-sky-500 text-sky-400'
                      : 'border-transparent text-slate-400'
                  }`}
                >
                  POLLS & QUIZ
                </button>
                <button
                  type="button"
                  onClick={() => setTheaterRightTab('students')}
                  className={`py-2.5 border-b-2 cursor-pointer ${
                    theaterRightTab === 'students'
                      ? 'border-sky-500 text-sky-400'
                      : 'border-transparent text-slate-400'
                  }`}
                >
                  ROSTER ({roster.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTheaterRightTab('chat')}
                  className={`py-2.5 border-b-2 cursor-pointer ${
                    theaterRightTab === 'chat'
                      ? 'border-sky-500 text-sky-400'
                      : 'border-transparent text-slate-400'
                  }`}
                >
                  CHAT
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
                {theaterRightTab === 'polls' && (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPollModalOpen(true)}
                        className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold cursor-pointer"
                      >
                        + Launch Poll
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuizModalOpen(true)}
                        className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                      >
                        + Push Quiz
                      </button>
                    </div>
                    {polls.map((poll) => (
                      <div
                        key={poll.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"
                      >
                        <p className="font-bold text-slate-100">{poll.prompt}</p>
                        {poll.options.map((o) => (
                          <div
                            key={o.id}
                            className="flex justify-between text-[11px] text-slate-400"
                          >
                            <span>{o.label}</span>
                            <span className="font-mono text-sky-300">{o.votes} votes</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    {quizzes.map((qz) => (
                      <div
                        key={qz.id}
                        className="p-3 rounded-xl bg-slate-950 border border-indigo-800/60 space-y-1"
                      >
                        <p className="font-bold text-indigo-300">{qz.title}</p>
                        <p className="text-slate-200">{qz.prompt}</p>
                      </div>
                    ))}
                    {workspace.materials.length > 0 && (
                      <div className="pt-2 border-t border-slate-800 space-y-1.5">
                        <p className="font-bold text-slate-400 uppercase text-[10px]">
                          Session Materials
                        </p>
                        {workspace.materials.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setViewingMaterial(m)}
                            className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="truncate font-medium">{m.title}</span>
                            <BookOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {theaterRightTab === 'students' && (
                  <div className="space-y-2">
                    {roster.map((s) => (
                      <div
                        key={s.id}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-semibold text-slate-100">{s.name}</p>
                          <p className="text-[10px] font-mono text-slate-500">{s.rollNo}</p>
                        </div>
                        <span className="text-[11px] text-emerald-400 font-semibold">
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {theaterRightTab === 'chat' && (
                  <div className="space-y-2">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-0.5"
                      >
                        <p className="font-bold text-sky-400">{msg.author}</p>
                        <p className="text-slate-200">{msg.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {theaterRightTab === 'chat' && (
                <form
                  onSubmit={handleSendChat}
                  className="p-3 border-t border-slate-800 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Send note to class chat..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
};
