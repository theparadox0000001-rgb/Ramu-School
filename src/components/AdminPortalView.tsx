import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Database,
  Download,
  FileSpreadsheet,
  GraduationCap,
  HelpCircle,
  History,
  LogOut,
  Menu,
  Moon,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminOverviewPayload,
  AdminUserRecord,
  BatchCohort,
  DifficultyLevel,
  ExamTrack,
  PortalRole,
  StudentProfile,
  SubjectName,
} from '../types/portal';
import { portalApi } from '../services/api';
import { AdminStudentsPanel } from './admin/AdminStudentsPanel';
import { AdminTeachersPanel } from './admin/AdminTeachersPanel';
import { AdminTestsPanel } from './admin/AdminTestsPanel';
import { AdminDataInjectorPanel } from './admin/AdminDataInjectorPanel';
import { AdminCommerceControlPanel } from './admin/AdminCommerceControlPanel';
import { AdminPlatformControlPanel } from './admin/AdminPlatformControlPanel';
import { AnswerSheetModal } from './admin/AnswerSheetModal';

type AdminTab =
  | 'overview'
  | 'injector'
  | 'students'
  | 'teachers'
  | 'tests'
  | 'batches'
  | 'commerce'
  | 'platform'
  | 'users'
  | 'curriculum'
  | 'tickets';
type ContentSubTab =
  | 'dpp_sheets'
  | 'chapters'
  | 'questions'
  | 'ncert_solutions'
  | 'flashcards'
  | 'live_classes'
  | 'json';

interface AdminPortalViewProps {
  admin: StudentProfile;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSwitchToTeacher: () => void;
  onSwitchToStudent: () => void;
  onImpersonateUser: (userId: string) => Promise<void>;
  onRefreshWorkspace?: () => Promise<void> | void;
  onLogout: () => void;
}

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
  'Sri Chaitanya Faculty Live Class Console',
  'Infinity Learn Institutional Control Center',
];

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  admin,
  darkMode,
  onToggleDarkMode,
  onSwitchToTeacher,
  onSwitchToStudent,
  onImpersonateUser,
  onRefreshWorkspace,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [contentSubTab, setContentSubTab] = useState<ContentSubTab>('dpp_sheets');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Deep 360° drill-down states
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentBatchFilter, setStudentBatchFilter] = useState<string>('all');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [inspectAttemptId, setInspectAttemptId] = useState<string | null>(null);

  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  // Users filter & create state
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | PortalRole>('all');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<PortalRole>('student');
  const [newUserTrack, setNewUserTrack] = useState<ExamTrack>('IIT-JEE');
  const [newUserGrade, setNewUserGrade] = useState('Class 12');
  const [newUserPassword, setNewUserPassword] = useState('Infinity@2027');
  const [newUserDobPin, setNewUserDobPin] = useState('2009-05-14');
  const [newUserAdmissionId, setNewUserAdmissionId] = useState('');
  const [newUserBatchId, setNewUserBatchId] = useState('');

  // Batches create state
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [batchCode, setBatchCode] = useState('');
  const [batchName, setBatchName] = useState('');
  const [batchTrack, setBatchTrack] = useState<ExamTrack>('IIT-JEE');
  const [batchCampus, setBatchCampus] = useState('Sri Chaitanya Madhapur, Hyderabad');
  const [batchFaculty, setBatchFaculty] = useState('Ekansh Mishra');
  const [batchCapacity, setBatchCapacity] = useState(60);
  const [batchStudentCount, setBatchStudentCount] = useState(0);
  const [batchSlot, setBatchSlot] = useState('Mon–Sat · 5:00 PM – 7:30 PM');
  const [batchStatus, setBatchStatus] = useState<BatchCohort['status']>('Active');

  // DPP Sheet Builder state
  const [dppTitle, setDppTitle] = useState('');
  const [dppSubject, setDppSubject] = useState<SubjectName>('Physics');
  const [dppDateLabel, setDppDateLabel] = useState('Today');
  const [dppEstMin, setDppEstMin] = useState(25);
  const [dppQuestionIds, setDppQuestionIds] = useState<string[]>([]);

  // Quick Chapter, Question, NCERT, Flashcard, JSON forms
  const [chSubject, setChSubject] = useState<SubjectName>('Physics');
  const [chTitle, setChTitle] = useState('');
  const [chUnit, setChUnit] = useState('Unit 1 · Core Syllabus');
  const [chWeightage, setChWeightage] = useState('8% Exam Weightage');
  const [lesTitle, setLesTitle] = useState('');
  const [lesSummary, setLesSummary] = useState('');
  const [lesFormula, setLesFormula] = useState('');

  const [qSubject, setQSubject] = useState<SubjectName>('Physics');
  const [qChapterTitle, setQChapterTitle] = useState('Magnetic Effects of Electric Current');
  const [qDifficulty, setQDifficulty] = useState<DifficultyLevel>('Moderate');
  const [qPrompt, setQPrompt] = useState('');
  const [qOptA, setQOptA] = useState('');
  const [qOptB, setQOptB] = useState('');
  const [qOptC, setQOptC] = useState('');
  const [qOptD, setQOptD] = useState('');
  const [qCorrectIdx, setQCorrectIdx] = useState(0);
  const [qFormula, setQFormula] = useState('');
  const [qExplanation, setQExplanation] = useState('');

  const [ncSubject, setNcSubject] = useState<SubjectName>('Physics');
  const [ncChapter, setNcChapter] = useState('');
  const [ncRef, setNcRef] = useState('NCERT Ex Q1');
  const [ncQuestion, setNcQuestion] = useState('');
  const [ncStepsText, setNcStepsText] = useState('');
  const [ncFinalAns, setNcFinalAns] = useState('');

  const [fcSubject, setFcSubject] = useState<SubjectName>('Physics');
  const [fcChapter, setFcChapter] = useState('');
  const [fcFront, setFcFront] = useState('');
  const [fcHint, setFcHint] = useState('');
  const [fcBack, setFcBack] = useState('');
  const [fcFormula, setFcFormula] = useState('');

  const [bulkJsonText, setBulkJsonText] = useState('');
  const [ticketFilter, setTicketFilter] = useState<'All' | 'Open' | 'Resolved'>('All');

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg('');
    try {
      const data = await portalApi.getAdminOverview();
      setOverview(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load admin overview.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  const notifyAndSync = async (message: string, syncWorkspace = true) => {
    setNoticeMsg(message);
    await loadOverview(true);
    if (syncWorkspace && onRefreshWorkspace) {
      await onRefreshWorkspace();
    }
  };

  const filteredUsers = useMemo(() => {
    if (!overview) return [];
    const q = userSearch.trim().toLowerCase();
    return overview.users.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.admissionId.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q)
      );
    });
  }, [overview, userSearch, userRoleFilter]);

  const filteredTickets = useMemo(() => {
    if (!overview) return [];
    if (ticketFilter === 'All') return overview.tickets;
    return overview.tickets.filter((t) => t.status === ticketFilter);
  }, [overview, ticketFilter]);

  // Handlers
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNoticeMsg('');
    setBusyAction(true);
    try {
      const selectedBatch = overview?.batches.find((b) => b.id === newUserBatchId);
      const res = await portalApi.createAdminUser({
        name: newUserName,
        email: newUserEmail,
        phone: newUserPhone,
        role: newUserRole,
        track: newUserTrack,
        grade: newUserGrade,
        password: newUserPassword,
        dobPin: newUserDobPin,
        admissionId: newUserAdmissionId,
        batchId: newUserBatchId || undefined,
        campus: selectedBatch?.campus,
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPhone('');
      setNewUserAdmissionId('');
      setNewUserBatchId('');
      setShowCreateUser(false);
      await notifyAndSync(`Provisioned ${newUserRole} account (${res.admissionId}).`, false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUpdateUser = async (
    user: AdminUserRecord,
    patch: {
      role?: PortalRole;
      track?: ExamTrack;
      programName?: string;
      batchId?: string | null;
      campus?: string;
    }
  ) => {
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.updateAdminUser(user.id, patch);
      await notifyAndSync(`Updated ${user.name} (${user.admissionId}).`, false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update user.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteUser = async (user: AdminUserRecord) => {
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.deleteAdminUser(user.id);
      await notifyAndSync(`Removed account ${user.name} (${user.admissionId}).`, false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove user.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.createBatch({
        code: batchCode,
        name: batchName,
        track: batchTrack,
        campus: batchCampus,
        leadFaculty: batchFaculty,
        capacity: batchCapacity,
        studentCount: batchStudentCount,
        scheduleSlot: batchSlot,
        status: batchStatus,
      });
      setBatchCode('');
      setBatchName('');
      setShowCreateBatch(false);
      await notifyAndSync('Batch cohort created and recorded in audit log.', false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create batch.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUpdateBatch = async (
    batch: BatchCohort,
    patch: { status?: BatchCohort['status']; studentCount?: number }
  ) => {
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.updateBatch(batch.id, patch);
      await notifyAndSync(`Updated cohort ${batch.code}.`, false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update batch.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteBatch = async (batch: BatchCohort) => {
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.deleteBatch(batch.id);
      await notifyAndSync(`Deleted cohort ${batch.code}.`, false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete batch.');
    } finally {
      setBusyAction(false);
    }
  };

  const jumpToStudent360 = (studentId: string) => {
    setSelectedStudentId(studentId);
    setActiveTab('students');
  };

  const jumpToTeacher360 = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    setActiveTab('teachers');
  };

  const handleCreateDpp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.createDppSheet({
        title: dppTitle,
        subject: dppSubject,
        dateLabel: dppDateLabel,
        estimatedMin: dppEstMin,
        questionIds: dppQuestionIds,
      });
      setDppTitle('');
      setDppQuestionIds([]);
      await notifyAndSync('Published DPP sheet to Student Courses module.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to publish DPP sheet.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.addChapterAndLesson({
        subject: chSubject,
        title: chTitle,
        unit: chUnit,
        weightage: chWeightage,
        lessonTitle: lesTitle,
        lessonType: 'video',
        durationMin: 35,
        summary: lesSummary,
        keyFormulas: lesFormula ? [lesFormula] : [],
        notesContent: lesSummary || lesTitle,
      });
      setChTitle('');
      setLesTitle('');
      setLesSummary('');
      setLesFormula('');
      await notifyAndSync('Saved new chapter and initial lesson.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save chapter.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.addQuestion({
        subject: qSubject,
        chapterId: `${qSubject.toLowerCase().slice(0, 4)}-custom`,
        chapterTitle: qChapterTitle,
        difficulty: qDifficulty,
        prompt: qPrompt,
        options: [qOptA, qOptB, qOptC, qOptD],
        correctIndex: qCorrectIdx,
        formulaUsed: qFormula,
        explanation: qExplanation,
      });
      setQPrompt('');
      setQOptA('');
      setQOptB('');
      setQOptC('');
      setQOptD('');
      setQFormula('');
      setQExplanation('');
      await notifyAndSync('Question saved to SQLite Question Bank.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add question.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddNcert = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.addNcertSolution({
        subject: ncSubject,
        chapter: ncChapter,
        exerciseRef: ncRef,
        question: ncQuestion,
        solutionSteps: ncStepsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        finalAnswer: ncFinalAns,
      });
      setNcChapter('');
      setNcQuestion('');
      setNcStepsText('');
      setNcFinalAns('');
      await notifyAndSync('NCERT solution published to Student Portal.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add NCERT solution.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddFlashcard = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.addFlashcard({
        subject: fcSubject,
        chapter: fcChapter,
        front: fcFront,
        hint: fcHint,
        back: fcBack,
        formula: fcFormula,
      });
      setFcChapter('');
      setFcFront('');
      setFcHint('');
      setFcBack('');
      setFcFormula('');
      await notifyAndSync('Flashcard added to Spaced Repetition deck.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add flashcard.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteContent = async (
    entity: 'chapters' | 'questions' | 'dpp_sheets' | 'ncert_solutions' | 'flashcards' | 'live_classes',
    id: string
  ) => {
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.deleteContentEntity(entity, id);
      await notifyAndSync(`Deleted ${entity.replace('_', ' ')} item (${id}).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete record.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleExportJson = async () => {
    setErrorMsg('');
    try {
      const data = await portalApi.exportCurriculumJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'infinity-learn-admin-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNoticeMsg('Exported institutional curriculum JSON snapshot.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusyAction(true);
    try {
      const parsed = JSON.parse(bulkJsonText) as Record<string, unknown>;
      const res = await portalApi.importCurriculumJson(parsed);
      setBulkJsonText('');
      await notifyAndSync(`Imported/updated ${res.recordsUpserted} curriculum records.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid JSON or import error.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleTicket = async (id: string, current: 'Open' | 'Resolved') => {
    const nextStatus = current === 'Open' ? 'Resolved' : 'Open';
    setErrorMsg('');
    setBusyAction(true);
    try {
      await portalApi.updateTicketStatus(id, nextStatus);
      await notifyAndSync(`Ticket ${id} marked ${nextStatus}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update ticket.');
    } finally {
      setBusyAction(false);
    }
  };

  const navItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'injector', label: 'Data Injector', icon: Upload },
    {
      id: 'students',
      label: 'Students 360°',
      icon: GraduationCap,
      badge: overview?.metrics.studentCount,
    },
    {
      id: 'teachers',
      label: 'Teachers 360°',
      icon: Presentation,
      badge: overview?.metrics.teacherCount,
    },
    {
      id: 'tests',
      label: 'Tests & Attempts',
      icon: ClipboardCheck,
      badge: overview?.metrics.totalMockTests,
    },
    {
      id: 'batches',
      label: 'Batches & Campuses',
      icon: Building2,
      badge: overview?.metrics.activeBatches,
    },
    { id: 'commerce', label: 'Commerce & Courses', icon: ShoppingBag },
    { id: 'platform', label: 'OS Control & Health', icon: Activity },
    { id: 'users', label: 'Users & RBAC', icon: Users, badge: overview?.metrics.totalUsers },
    { id: 'curriculum', label: 'Curriculum & DPPs', icon: Database },
    {
      id: 'tickets',
      label: 'Tickets & Audit Log',
      icon: HelpCircle,
      badge: overview?.metrics.openTicketsCount,
    },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || 'Overview';

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Institutional Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-slate-900 dark:bg-slate-950 border-r border-slate-800 text-slate-100 sticky top-0 h-screen">
        <div className="px-5 h-16 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-bold tracking-tight text-white font-display truncate">
              Ramu School Admin
            </p>
            <p className="text-[11px] font-mono text-slate-400 truncate">admin.ramuschool.edu</p>
          </div>
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        </div>

        <nav aria-label="Admin console navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setNoticeMsg('');
                  setErrorMsg('');
                }}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && (
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      isActive ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-1.5">
          <button
            type="button"
            onClick={onSwitchToTeacher}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
            <span>Teacher Portal</span>
          </button>
          <button
            type="button"
            onClick={onSwitchToStudent}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Student Preview</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-950/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-100 flex flex-col h-full z-10 border-r border-slate-800">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="text-base font-bold font-display">Ramu School Admin</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                      isActive ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {typeof item.badge === 'number' && (
                      <span className="font-mono text-[11px] tabular-nums">{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-800 space-y-1">
              <button
                type="button"
                onClick={onSwitchToTeacher}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Teacher Portal</span>
              </button>
              <button
                type="button"
                onClick={onSwitchToStudent}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Student Preview</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-950/50 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open admin menu"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
              <span className="hidden sm:inline">Ramu School</span>
              <span className="hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="hidden md:inline">Admin Console</span>
              <span className="hidden md:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {activeNavLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 relative">
            <button
              type="button"
              onClick={() => void loadOverview(false)}
              disabled={loading || busyAction}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync DB</span>
            </button>

            <button
              type="button"
              onClick={onSwitchToTeacher}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Teacher View</span>
            </button>

            <button
              type="button"
              onClick={onSwitchToStudent}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Student Preview</span>
            </button>

            <button
              type="button"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={onToggleDarkMode}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              aria-label="Open admin profile menu"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <span className="w-7 h-7 rounded-full bg-slate-900 dark:bg-blue-700 text-white text-xs font-bold flex items-center justify-center">
                {admin.initials || 'RR'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 top-12 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-40 text-xs">
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white truncate">{admin.name}</p>
                  <p className="text-slate-500 dark:text-slate-400 truncate font-mono text-[11px]">
                    {admin.admissionId} · Super Admin
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onSwitchToTeacher();
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                  <span>Open Teacher Portal</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onSwitchToStudent();
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>Preview Student Portal</span>
                </button>
                <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2.5 font-semibold cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
          {/* Action Notifications & Errors */}
          {errorMsg && (
            <div
              role="alert"
              className="px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs font-medium text-rose-800 dark:text-rose-300 flex items-center justify-between gap-4"
            >
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                className="text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {noticeMsg && (
            <div
              role="status"
              className="px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-4"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{noticeMsg}</span>
              </span>
              <button
                type="button"
                onClick={() => setNoticeMsg('')}
                className="text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {loading && !overview ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-blue-700 border-t-transparent animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Loading institutional telemetry and SQLite records...
              </p>
            </div>
          ) : !overview ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Unable to retrieve admin overview
              </p>
              <button
                type="button"
                onClick={() => void loadOverview(false)}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Retry Sync
              </button>
            </div>
          ) : (
            <>
              {/* ============================================================
                  TAB 1: OVERVIEW
              ============================================================ */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Sri Chaitanya · Infinity Learn Operations
                      </p>
                      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display mt-0.5">
                        Institutional Control Overview
                      </h1>
                    </div>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      Signed in as {admin.name} · {admin.admissionId}
                    </p>
                  </div>

                  {/* 6-KPI Institutional Metrics Strip */}
                  <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 tabular-nums">
                    {[
                      {
                        label: 'Total Accounts',
                        value: overview.metrics.totalUsers,
                        sub: `${overview.metrics.studentCount} students · ${overview.metrics.teacherCount} faculty`,
                      },
                      {
                        label: 'Active Cohorts',
                        value: overview.metrics.activeBatches,
                        sub: `${overview.metrics.totalBatches} total batches`,
                      },
                      {
                        label: 'Question Bank',
                        value: overview.metrics.totalQuestions,
                        sub: `${overview.metrics.totalChapters} chapters · ${overview.metrics.totalLessons} lessons`,
                      },
                      {
                        label: 'AITS & Mock Tests',
                        value: overview.metrics.totalMockTests,
                        sub: `${overview.metrics.totalDppSheets} DPP sheets live`,
                      },
                      {
                        label: 'Open Tickets',
                        value: overview.metrics.openTicketsCount,
                        sub: `${overview.tickets.length} total support tickets`,
                      },
                      {
                        label: 'Avg Test Accuracy',
                        value: `${overview.metrics.avgAccuracyPercent}%`,
                        sub: `${overview.metrics.totalTestAttempts} recorded attempts`,
                      },
                    ].map((kpi) => (
                      <div
                        key={kpi.label}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1.5"
                      >
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {kpi.label}
                        </p>
                        <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                          {kpi.value}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {kpi.sub}
                        </p>
                      </div>
                    ))}
                  </section>

                  {/* Institutional Hierarchy Strip */}
                  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        Infinity Learn Institutional Architecture
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Campuses & Batches → Faculty & Live Classes → Enrolled Students → AITS Tests & Answer Sheets
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('injector')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Inject Quiz / Test Data</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudentId(null);
                          setActiveTab('students');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Explore All Students ({overview.metrics.studentCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTeacherId(null);
                          setActiveTab('teachers');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Explore All Teachers ({overview.metrics.teacherCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('tests')}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        All Tests & Ledger ({overview.metrics.totalTestAttempts})
                      </button>
                    </div>
                  </section>

                  {/* Cohort Utilization & Recent AITS/CYOT Attempts */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    <section className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                          Campus & Online Cohort Utilization
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveTab('batches')}
                          className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                        >
                          Manage Batches
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="py-2.5 px-4 font-semibold">Batch Code</th>
                              <th className="py-2.5 px-4 font-semibold">Track · Campus</th>
                              <th className="py-2.5 px-4 font-semibold text-right">Occupancy</th>
                              <th className="py-2.5 px-4 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                            {overview.batches.map((b) => {
                              const pct = Math.min(
                                100,
                                Math.round((b.studentCount / Math.max(1, b.capacity)) * 100)
                              );
                              return (
                                <tr key={b.id}>
                                  <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setStudentBatchFilter(b.id);
                                        setSelectedStudentId(null);
                                        setActiveTab('students');
                                      }}
                                      className="hover:text-blue-700 dark:hover:text-blue-400 hover:underline cursor-pointer"
                                    >
                                      {b.code}
                                    </button>
                                  </td>
                                  <td className="py-3 px-4">
                                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                                      {b.name}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {b.track} · {b.campus}
                                    </p>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono whitespace-nowrap">
                                    {b.studentCount}/{b.capacity} ({pct}%)
                                  </td>
                                  <td className="py-3 px-4 font-semibold whitespace-nowrap">
                                    <span
                                      className={
                                        b.status === 'Active'
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : b.status === 'Upcoming'
                                          ? 'text-blue-700 dark:text-blue-400'
                                          : 'text-slate-500 dark:text-slate-400'
                                      }
                                    >
                                      {b.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                          Recent AITS & CYOT Submissions
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveTab('tests')}
                          className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                        >
                          All Tests & Attempts
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        {overview.recentAttempts.length === 0 ? (
                          <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
                            No test submissions recorded yet.
                          </p>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="py-2.5 px-4 font-semibold">Student</th>
                                <th className="py-2.5 px-4 font-semibold">Assessment</th>
                                <th className="py-2.5 px-4 font-semibold text-right">Score</th>
                                <th className="py-2.5 px-4 font-semibold text-right">Sheet</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
                              {overview.recentAttempts.slice(0, 8).map((att) => (
                                <tr key={att.id}>
                                  <td className="py-3 px-4">
                                    <button
                                      type="button"
                                      onClick={() => jumpToStudent360(att.userId)}
                                      className="font-semibold text-slate-900 dark:text-white hover:text-blue-700 dark:hover:text-blue-400 hover:underline cursor-pointer text-left"
                                    >
                                      {att.studentName}
                                    </button>
                                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                      {att.admissionId || att.userId}
                                    </p>
                                  </td>
                                  <td className="py-3 px-4">
                                    <p className="font-medium text-slate-800 dark:text-slate-200">
                                      {att.testTitle}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {att.category} · {att.dateLabel}
                                    </p>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                                    {att.score}/{att.maxScore} ({att.accuracyPercent}%)
                                  </td>
                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => setInspectAttemptId(att.id)}
                                      className="text-blue-700 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                                    >
                                      Inspect
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {/* ============================================================
                  TAB: DATA INJECTOR & DAILY QUIZ STUDIO
              ============================================================ */}
              {activeTab === 'injector' && (
                <AdminDataInjectorPanel
                  onNotify={(msg) => setNoticeMsg(msg)}
                  onError={(msg) => setErrorMsg(msg)}
                  onOpenTestsTab={() => setActiveTab('tests')}
                  onRefreshParent={async () => {
                    await loadOverview(true);
                    if (onRefreshWorkspace) {
                      await onRefreshWorkspace();
                    }
                  }}
                />
              )}

              {/* ============================================================
                  TAB: STUDENTS 360°
              ============================================================ */}
              {activeTab === 'students' && (
                <AdminStudentsPanel
                  batches={overview.batches}
                  selectedStudentId={selectedStudentId}
                  onSelectStudentId={setSelectedStudentId}
                  initialBatchFilter={studentBatchFilter}
                  onImpersonateUser={onImpersonateUser}
                  onNotify={(msg) => setNoticeMsg(msg)}
                  onError={(msg) => setErrorMsg(msg)}
                  onRefreshParent={() => loadOverview(true)}
                />
              )}

              {/* ============================================================
                  TAB: TEACHERS 360°
              ============================================================ */}
              {activeTab === 'teachers' && (
                <AdminTeachersPanel
                  selectedTeacherId={selectedTeacherId}
                  onSelectTeacherId={setSelectedTeacherId}
                  onInspectStudent={jumpToStudent360}
                  onImpersonateUser={onImpersonateUser}
                  onNotify={(msg) => setNoticeMsg(msg)}
                  onError={(msg) => setErrorMsg(msg)}
                  onRefreshParent={() => loadOverview(true)}
                />
              )}

              {/* ============================================================
                  TAB 2: USERS & RBAC PROVISIONING
              ============================================================ */}
              {activeTab === 'users' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
                        User Accounts, RBAC & Subscription Control
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Provision Student, Faculty, or Admin accounts and override roles or enrolled programs directly in SQLite.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateUser(!showCreateUser)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{showCreateUser ? 'Close Form' : 'Provision Account'}</span>
                    </button>
                  </div>

                  {showCreateUser && (
                    <form
                      onSubmit={handleCreateUser}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
                    >
                      <h2 className="text-sm font-bold font-display text-slate-900 dark:text-white">
                        Create New Institutional Account
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <div>
                          <label className="block text-xs font-medium mb-1">Full Name</label>
                          <input
                            type="text"
                            required
                            value={newUserName}
                            onChange={(e) => setNewUserName(e.target.value)}
                            placeholder="e.g., Siddharth Nair"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Email Address</label>
                          <input
                            type="email"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                            placeholder="user@infinitylearn.com"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Mobile Number</label>
                          <input
                            type="tel"
                            value={newUserPhone}
                            onChange={(e) => setNewUserPhone(e.target.value)}
                            placeholder="9848012345"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Role (RBAC)</label>
                          <select
                            value={newUserRole}
                            onChange={(e) => setNewUserRole(e.target.value as PortalRole)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="student">Student</option>
                            <option value="teacher">Teacher / Faculty</option>
                            <option value="parent">Parent / Guardian</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Academic Track</label>
                          <select
                            value={newUserTrack}
                            onChange={(e) => setNewUserTrack(e.target.value as ExamTrack)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            {TRACK_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Grade / Designation</label>
                          <input
                            type="text"
                            value={newUserGrade}
                            onChange={(e) => setNewUserGrade(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Batch Cohort (Optional)
                          </label>
                          <select
                            value={newUserBatchId}
                            onChange={(e) => setNewUserBatchId(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="">Unassigned / Online</option>
                            {overview.batches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.code} · {b.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Admission / Staff ID (Optional)
                          </label>
                          <input
                            type="text"
                            value={newUserAdmissionId}
                            onChange={(e) => setNewUserAdmissionId(e.target.value)}
                            placeholder="Auto-generated if blank"
                            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Initial Password & DOB PIN
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={newUserPassword}
                              onChange={(e) => setNewUserPassword(e.target.value)}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                            <input
                              type="date"
                              value={newUserDobPin}
                              onChange={(e) => setNewUserDobPin(e.target.value)}
                              className="w-full px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCreateUser(false)}
                          className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={busyAction}
                          className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                        >
                          Create Account in SQLite
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Search & Role Filters */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search by name, email, phone, or ID..."
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-x-auto">
                      {(['all', 'student', 'teacher', 'parent', 'admin'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setUserRoleFilter(r)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize whitespace-nowrap cursor-pointer ${
                            userRoleFilter === r
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {r === 'all' ? `All (${overview.users.length})` : r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Users Table */}
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4 font-semibold">User & Contact</th>
                          <th className="py-3 px-4 font-semibold">ID</th>
                          <th className="py-3 px-4 font-semibold">Role</th>
                          <th className="py-3 px-4 font-semibold">Batch Cohort</th>
                          <th className="py-3 px-4 font-semibold">Track</th>
                          <th className="py-3 px-4 font-semibold">Enrolled Program / Plan</th>
                          <th className="py-3 px-4 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredUsers.map((u) => {
                          const isSelf = u.id === admin.id;
                          return (
                            <tr key={u.id}>
                              <td className="py-3 px-4">
                                {u.role === 'student' ? (
                                  <button
                                    type="button"
                                    onClick={() => jumpToStudent360(u.id)}
                                    className="font-semibold text-slate-900 dark:text-white hover:text-blue-700 dark:hover:text-blue-400 hover:underline cursor-pointer text-left"
                                  >
                                    {u.name}
                                  </button>
                                ) : u.role === 'teacher' ? (
                                  <button
                                    type="button"
                                    onClick={() => jumpToTeacher360(u.id)}
                                    className="font-semibold text-slate-900 dark:text-white hover:text-blue-700 dark:hover:text-blue-400 hover:underline cursor-pointer text-left"
                                  >
                                    {u.name}
                                  </button>
                                ) : (
                                  <p className="font-semibold text-slate-900 dark:text-white">
                                    {u.name} {isSelf ? '(You)' : ''}
                                  </p>
                                )}
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {[u.email, u.phone].filter(Boolean).join(' · ') || 'No contact'}
                                </p>
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">
                                {u.admissionId}
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  aria-label={`Role for ${u.name}`}
                                  disabled={isSelf || busyAction}
                                  value={u.role}
                                  onChange={(e) =>
                                    void handleUpdateUser(u, { role: e.target.value as PortalRole })
                                  }
                                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60"
                                >
                                  <option value="student">student</option>
                                  <option value="teacher">teacher</option>
                                  <option value="parent">parent</option>
                                  <option value="admin">admin</option>
                                </select>
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  aria-label={`Batch for ${u.name}`}
                                  disabled={busyAction}
                                  value={u.batchId || ''}
                                  onChange={(e) => {
                                    const bId = e.target.value || null;
                                    const targetBatch = overview.batches.find((b) => b.id === bId);
                                    void handleUpdateUser(u, {
                                      batchId: bId,
                                      campus: targetBatch?.campus || u.campus,
                                    });
                                  }}
                                  className="max-w-[160px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                                >
                                  <option value="">Unassigned</option>
                                  {overview.batches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.code}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  aria-label={`Track for ${u.name}`}
                                  disabled={busyAction}
                                  value={u.track}
                                  onChange={(e) =>
                                    void handleUpdateUser(u, { track: e.target.value as ExamTrack })
                                  }
                                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                                >
                                  {TRACK_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-4">
                                <select
                                  aria-label={`Program for ${u.name}`}
                                  disabled={busyAction}
                                  value={
                                    PROGRAM_OPTIONS.includes(u.programName)
                                      ? u.programName
                                      : PROGRAM_OPTIONS[0]
                                  }
                                  onChange={(e) =>
                                    void handleUpdateUser(u, { programName: e.target.value })
                                  }
                                  className="max-w-[210px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                                >
                                  {PROGRAM_OPTIONS.map((p) => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  disabled={isSelf || busyAction}
                                  onClick={() => void handleDeleteUser(u)}
                                  aria-label={`Delete ${u.name}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Remove</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ============================================================
                  TAB 3: BATCHES & CAMPUSES
              ============================================================ */}
              {activeTab === 'batches' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
                        Batch Cohorts & Campus Operations
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Configure Sri Chaitanya hybrid centers, online cohorts, faculty leads, and enrollment capacity.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateBatch(!showCreateBatch)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showCreateBatch ? 'Close Form' : 'Create Cohort'}</span>
                    </button>
                  </div>

                  {showCreateBatch && (
                    <form
                      onSubmit={handleCreateBatch}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
                    >
                      <h2 className="text-sm font-bold font-display">New Batch Cohort</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <div>
                          <label className="block text-xs font-medium mb-1">Batch Code</label>
                          <input
                            type="text"
                            required
                            value={batchCode}
                            onChange={(e) => setBatchCode(e.target.value)}
                            placeholder="e.g., SC-HYD-JEE-27C"
                            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Cohort Name</label>
                          <input
                            type="text"
                            required
                            value={batchName}
                            onChange={(e) => setBatchName(e.target.value)}
                            placeholder="e.g., JEE Zenith Star Batch"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Track</label>
                          <select
                            value={batchTrack}
                            onChange={(e) => setBatchTrack(e.target.value as ExamTrack)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            {TRACK_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Campus / Mode</label>
                          <input
                            type="text"
                            required
                            value={batchCampus}
                            onChange={(e) => setBatchCampus(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Lead Faculty</label>
                          <input
                            type="text"
                            required
                            value={batchFaculty}
                            onChange={(e) => setBatchFaculty(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Schedule Slot</label>
                          <input
                            type="text"
                            required
                            value={batchSlot}
                            onChange={(e) => setBatchSlot(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Enrolled / Capacity
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              min={0}
                              value={batchStudentCount}
                              onChange={(e) => setBatchStudentCount(Number(e.target.value))}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                            />
                            <input
                              type="number"
                              min={10}
                              value={batchCapacity}
                              onChange={(e) => setBatchCapacity(Number(e.target.value))}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Status</label>
                          <select
                            value={batchStatus}
                            onChange={(e) => setBatchStatus(e.target.value as BatchCohort['status'])}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="Active">Active</option>
                            <option value="Upcoming">Upcoming</option>
                            <option value="Archived">Archived</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCreateBatch(false)}
                          className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={busyAction}
                          className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                        >
                          Create Batch Cohort
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {overview.batches.map((b) => {
                      const pct = Math.min(
                        100,
                        Math.round((b.studentCount / Math.max(1, b.capacity)) * 100)
                      );
                      return (
                        <article
                          key={b.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-mono font-semibold text-blue-700 dark:text-blue-400">
                                {b.code} · {b.track}
                              </p>
                              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display mt-0.5">
                                {b.name}
                              </h2>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {b.campus} · Lead: {b.leadFaculty}
                              </p>
                            </div>
                            <select
                              aria-label={`Status for ${b.code}`}
                              disabled={busyAction}
                              value={b.status}
                              onChange={(e) =>
                                void handleUpdateBatch(b, {
                                  status: e.target.value as BatchCohort['status'],
                                })
                              }
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                            >
                              <option value="Active">Active</option>
                              <option value="Upcoming">Upcoming</option>
                              <option value="Archived">Archived</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs tabular-nums">
                              <span className="text-slate-500 dark:text-slate-400">
                                {b.scheduleSlot}
                              </span>
                              <span className="font-mono font-semibold">
                                {b.studentCount}/{b.capacity} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-blue-700 dark:bg-blue-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 dark:text-slate-400">Enrollment:</span>
                              <button
                                type="button"
                                disabled={busyAction || b.studentCount <= 0}
                                onClick={() =>
                                  void handleUpdateBatch(b, {
                                    studentCount: Math.max(0, b.studentCount - 1),
                                  })
                                }
                                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono cursor-pointer disabled:opacity-40"
                              >
                                -1
                              </button>
                              <button
                                type="button"
                                disabled={busyAction || b.studentCount >= b.capacity}
                                onClick={() =>
                                  void handleUpdateBatch(b, {
                                    studentCount: Math.min(b.capacity, b.studentCount + 1),
                                  })
                                }
                                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono cursor-pointer disabled:opacity-40"
                              >
                                +1
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setStudentBatchFilter(b.id);
                                  setSelectedStudentId(null);
                                  setActiveTab('students');
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-semibold cursor-pointer whitespace-nowrap"
                              >
                                View Batch Students
                              </button>
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => void handleDeleteBatch(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ============================================================
                  TAB 4: AITS, MOCK TESTS & ATTEMPT LEDGER 360°
              ============================================================ */}
              {activeTab === 'tests' && (
                <AdminTestsPanel
                  questions={overview.questions}
                  onInspectStudent={jumpToStudent360}
                  onNotify={(msg) => setNoticeMsg(msg)}
                  onError={(msg) => setErrorMsg(msg)}
                  onRefreshParent={() => loadOverview(true)}
                />
              )}

              {/* ============================================================
                  TAB 5: CURRICULUM & DPPs STUDIO
              ============================================================ */}
              {activeTab === 'curriculum' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
                        Curriculum Repository, DPPs & Bulk Import
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Publish Daily Practice Problems, chapters, questions, NCERT solutions, flashcards, or import/export full JSON schemas.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleExportJson()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON Schema</span>
                    </button>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-x-auto">
                    {(
                      [
                        { id: 'dpp_sheets', label: `DPP Sheets (${overview.dppSheets.length})` },
                        { id: 'chapters', label: `Chapters (${overview.chapters.length})` },
                        { id: 'questions', label: `Questions (${overview.questions.length})` },
                        {
                          id: 'ncert_solutions',
                          label: `NCERT (${overview.ncertSolutions.length})`,
                        },
                        { id: 'flashcards', label: `Flashcards (${overview.flashcards.length})` },
                        { id: 'live_classes', label: `Live Classes (${overview.liveClasses.length})` },
                        { id: 'json', label: 'Bulk JSON Import' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setContentSubTab(st.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                          contentSubTab === st.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* Sub-tab: DPP Sheets */}
                  {contentSubTab === 'dpp_sheets' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                      <form
                        onSubmit={handleCreateDpp}
                        className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5"
                      >
                        <h2 className="text-sm font-bold font-display flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                          <span>Publish New DPP Sheet</span>
                        </h2>
                        <div>
                          <label className="block text-xs font-medium mb-1">DPP Title</label>
                          <input
                            type="text"
                            required
                            value={dppTitle}
                            onChange={(e) => setDppTitle(e.target.value)}
                            placeholder="e.g., DPP #15 · Ampere's Law Numericals"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-xs font-medium mb-1">Subject</label>
                            <select
                              value={dppSubject}
                              onChange={(e) => setDppSubject(e.target.value as SubjectName)}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            >
                              {SUBJECT_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Release Label</label>
                            <input
                              type="text"
                              value={dppDateLabel}
                              onChange={(e) => setDppDateLabel(e.target.value)}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Est. Min</label>
                            <input
                              type="number"
                              min={5}
                              value={dppEstMin}
                              onChange={(e) => setDppEstMin(Number(e.target.value))}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                            />
                          </div>
                        </div>

                        <div>
                          <span className="block text-xs font-medium mb-1.5">
                            Attach Questions ({dppQuestionIds.length} selected)
                          </span>
                          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
                            {overview.questions.map((q) => {
                              const checked = dppQuestionIds.includes(q.id);
                              return (
                                <label
                                  key={q.id}
                                  className="flex items-start gap-2 p-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setDppQuestionIds((prev) =>
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
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={busyAction || dppQuestionIds.length === 0}
                            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Publish DPP Sheet
                          </button>
                        </div>
                      </form>

                      <div className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                        {overview.dppSheets.map((d) => (
                          <div
                            key={d.id}
                            className="p-4 flex items-center justify-between gap-4 text-xs"
                          >
                            <div>
                              <p className="font-semibold text-sm text-slate-900 dark:text-white">
                                {d.title}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                                {d.subject} · {d.dateLabel} · {d.estimatedMin} min ·{' '}
                                {d.questionIds.length} Questions
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => void handleDeleteContent('dpp_sheets', d.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-tab: Chapters */}
                  {contentSubTab === 'chapters' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                      <form
                        onSubmit={handleAddChapter}
                        className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5"
                      >
                        <h2 className="text-sm font-bold font-display">Add Chapter & Initial Lesson</h2>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium mb-1">Subject</label>
                            <select
                              value={chSubject}
                              onChange={(e) => setChSubject(e.target.value as SubjectName)}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            >
                              {SUBJECT_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Weightage</label>
                            <input
                              type="text"
                              value={chWeightage}
                              onChange={(e) => setChWeightage(e.target.value)}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Unit</label>
                          <input
                            type="text"
                            value={chUnit}
                            onChange={(e) => setChUnit(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Chapter Title</label>
                          <input
                            type="text"
                            required
                            value={chTitle}
                            onChange={(e) => setChTitle(e.target.value)}
                            placeholder="e.g., Ray Optics & Optical Instruments"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Initial Lesson Title
                          </label>
                          <input
                            type="text"
                            required
                            value={lesTitle}
                            onChange={(e) => setLesTitle(e.target.value)}
                            placeholder="e.g., Snell's Law & Total Internal Reflection"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Key Formula</label>
                          <input
                            type="text"
                            value={lesFormula}
                            onChange={(e) => setLesFormula(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Summary</label>
                          <input
                            type="text"
                            value={lesSummary}
                            onChange={(e) => setLesSummary(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={busyAction}
                            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            Save Chapter
                          </button>
                        </div>
                      </form>

                      <div className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                        {overview.chapters.map((ch) => (
                          <div
                            key={ch.id}
                            className="p-4 flex items-center justify-between gap-4 text-xs"
                          >
                            <div>
                              <p className="font-semibold text-sm text-slate-900 dark:text-white">
                                {ch.title}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                                {ch.subject} · {ch.unit} · {ch.weightage} · {ch.lessons.length}{' '}
                                lessons
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => void handleDeleteContent('chapters', ch.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-tab: Questions */}
                  {contentSubTab === 'questions' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                      <form
                        onSubmit={handleAddQuestion}
                        className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                      >
                        <h2 className="text-sm font-bold font-display">Add CYOT / Mock Question</h2>
                        <div className="grid grid-cols-2 gap-2.5">
                          <select
                            value={qSubject}
                            onChange={(e) => setQSubject(e.target.value as SubjectName)}
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            {SUBJECT_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <select
                            value={qDifficulty}
                            onChange={(e) => setQDifficulty(e.target.value as DifficultyLevel)}
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="Foundation">Foundation</option>
                            <option value="Moderate">Moderate</option>
                            <option value="Advanced">Advanced</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          required
                          value={qChapterTitle}
                          onChange={(e) => setQChapterTitle(e.target.value)}
                          placeholder="Chapter Title"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <textarea
                          rows={2}
                          required
                          value={qPrompt}
                          onChange={(e) => setQPrompt(e.target.value)}
                          placeholder="Question prompt..."
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            value={qOptA}
                            onChange={(e) => setQOptA(e.target.value)}
                            placeholder="Option A"
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <input
                            type="text"
                            required
                            value={qOptB}
                            onChange={(e) => setQOptB(e.target.value)}
                            placeholder="Option B"
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <input
                            type="text"
                            required
                            value={qOptC}
                            onChange={(e) => setQOptC(e.target.value)}
                            placeholder="Option C"
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <input
                            type="text"
                            required
                            value={qOptD}
                            onChange={(e) => setQOptD(e.target.value)}
                            placeholder="Option D"
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={qCorrectIdx}
                            onChange={(e) => setQCorrectIdx(Number(e.target.value))}
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value={0}>Correct: Option A</option>
                            <option value={1}>Correct: Option B</option>
                            <option value={2}>Correct: Option C</option>
                            <option value={3}>Correct: Option D</option>
                          </select>
                          <input
                            type="text"
                            value={qFormula}
                            onChange={(e) => setQFormula(e.target.value)}
                            placeholder="Formula used"
                            className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <input
                          type="text"
                          value={qExplanation}
                          onChange={(e) => setQExplanation(e.target.value)}
                          placeholder="Step-by-step explanation"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={busyAction}
                            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            Add Question
                          </button>
                        </div>
                      </form>

                      <div className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800 max-h-[620px] overflow-y-auto">
                        {overview.questions.map((q) => (
                          <div
                            key={q.id}
                            className="p-4 flex items-start justify-between gap-4 text-xs"
                          >
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {q.prompt}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400">
                                {q.subject} · {q.chapterTitle} · {q.difficulty} · Ans:{' '}
                                {['A', 'B', 'C', 'D'][q.correctIndex]}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => void handleDeleteContent('questions', q.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-tab: NCERT Solutions */}
                  {contentSubTab === 'ncert_solutions' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                      <form
                        onSubmit={handleAddNcert}
                        className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                      >
                        <h2 className="text-sm font-bold font-display">Add NCERT Solution</h2>
                        <div className="grid grid-cols-2 gap-2.5">
                          <select
                            value={ncSubject}
                            onChange={(e) => setNcSubject(e.target.value as SubjectName)}
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            {SUBJECT_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            required
                            value={ncRef}
                            onChange={(e) => setNcRef(e.target.value)}
                            placeholder="NCERT Ex 3.4"
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <input
                          type="text"
                          required
                          value={ncChapter}
                          onChange={(e) => setNcChapter(e.target.value)}
                          placeholder="Chapter Name"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          required
                          value={ncQuestion}
                          onChange={(e) => setNcQuestion(e.target.value)}
                          placeholder="NCERT Question"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <textarea
                          rows={3}
                          required
                          value={ncStepsText}
                          onChange={(e) => setNcStepsText(e.target.value)}
                          placeholder="Solution steps (one step per line)"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          required
                          value={ncFinalAns}
                          onChange={(e) => setNcFinalAns(e.target.value)}
                          placeholder="Final Answer"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={busyAction}
                            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            Publish NCERT Solution
                          </button>
                        </div>
                      </form>

                      <div className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                        {overview.ncertSolutions.map((n) => (
                          <div
                            key={n.id}
                            className="p-4 flex items-start justify-between gap-4 text-xs"
                          >
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {n.question}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400">
                                {n.subject} · {n.chapter} · {n.exerciseRef}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => void handleDeleteContent('ncert_solutions', n.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-tab: Flashcards */}
                  {contentSubTab === 'flashcards' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                      <form
                        onSubmit={handleAddFlashcard}
                        className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                      >
                        <h2 className="text-sm font-bold font-display">Add Revision Flashcard</h2>
                        <div className="grid grid-cols-2 gap-2.5">
                          <select
                            value={fcSubject}
                            onChange={(e) => setFcSubject(e.target.value as SubjectName)}
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            {SUBJECT_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            required
                            value={fcChapter}
                            onChange={(e) => setFcChapter(e.target.value)}
                            placeholder="Chapter"
                            className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                        <input
                          type="text"
                          required
                          value={fcFront}
                          onChange={(e) => setFcFront(e.target.value)}
                          placeholder="Front prompt"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          value={fcHint}
                          onChange={(e) => setFcHint(e.target.value)}
                          placeholder="Hint"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <textarea
                          rows={2}
                          required
                          value={fcBack}
                          onChange={(e) => setFcBack(e.target.value)}
                          placeholder="Back answer"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          value={fcFormula}
                          onChange={(e) => setFcFormula(e.target.value)}
                          placeholder="Key formula"
                          className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={busyAction}
                            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            Save Flashcard
                          </button>
                        </div>
                      </form>

                      <div className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                        {overview.flashcards.map((fc) => (
                          <div
                            key={fc.id}
                            className="p-4 flex items-start justify-between gap-4 text-xs"
                          >
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {fc.front}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400">
                                {fc.subject} · {fc.chapter} · {fc.formula}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => void handleDeleteContent('flashcards', fc.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-tab: Live Classes */}
                  {contentSubTab === 'live_classes' && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                      {overview.liveClasses.map((lc) => (
                        <div
                          key={lc.id}
                          className="p-4 flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-sm text-slate-900 dark:text-white">
                              {lc.title}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                              {lc.subject} · {lc.instructor} · {lc.gradeLabel} · {lc.status} ·{' '}
                              {lc.dateLabel} · {lc.timeRange}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => void handleDeleteContent('live_classes', lc.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sub-tab: Bulk JSON Import */}
                  {contentSubTab === 'json' && (
                    <form
                      onSubmit={handleBulkImport}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                    >
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        Paste JSON matching the exported schema (containing any subset of{' '}
                        <code className="font-mono">chapters</code>,{' '}
                        <code className="font-mono">questions</code>,{' '}
                        <code className="font-mono">dppSheets</code>,{' '}
                        <code className="font-mono">ncertSolutions</code>,{' '}
                        <code className="font-mono">mockTests</code>, or{' '}
                        <code className="font-mono">flashcards</code>) to atomically upsert into SQLite.
                      </p>
                      <textarea
                        rows={8}
                        required
                        value={bulkJsonText}
                        onChange={(e) => setBulkJsonText(e.target.value)}
                        placeholder='{ "questions": [ ... ], "chapters": [ ... ] }'
                        className="w-full px-3.5 py-3 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                      />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={busyAction}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Import JSON into SQLite</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* ============================================================
                  TAB 6: TICKETS & AUDIT LOG
              ============================================================ */}
              {activeTab === 'tickets' && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  {/* Support Tickets Triage */}
                  <section className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-sm font-bold font-display text-slate-900 dark:text-white">
                        Student Support Desk ({filteredTickets.length})
                      </h2>
                      <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                        {(['All', 'Open', 'Resolved'] as const).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setTicketFilter(f)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                              ticketFilter === f
                                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredTickets.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                        No support tickets match the selected filter.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredTickets.map((t) => (
                          <div key={t.id} className="p-4 space-y-2 text-xs">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-sm text-slate-900 dark:text-white">
                                  {t.subject}
                                </p>
                                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                                  {t.userName} ({t.admissionId || t.userEmail || t.userId}) ·{' '}
                                  {t.category} · {t.createdAt}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => void handleToggleTicket(t.id, t.status)}
                                className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap shrink-0 cursor-pointer border ${
                                  t.status === 'Open'
                                    ? 'border-emerald-600 bg-emerald-700 text-white hover:bg-emerald-800'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                {t.status === 'Open' ? 'Mark Resolved' : 'Reopen Ticket'}
                              </button>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                              {t.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Audit Logs */}
                  <section className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-bold font-display text-slate-900 dark:text-white flex items-center gap-2">
                        <History className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                        <span>Institutional Audit Log</span>
                      </h2>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {overview.auditLogs.length} events
                      </span>
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
                      {overview.auditLogs.map((log) => (
                        <div key={log.id} className="p-4 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {log.action}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {log.createdAt}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300">{log.details}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {log.actorName} ({log.actorRole}) · {log.targetType}:{' '}
                            <span className="font-mono">{log.targetId}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
              {activeTab === 'commerce' && (
                <AdminCommerceControlPanel
                  users={overview.users}
                  onNotify={(msg) => setNoticeMsg(msg)}
                />
              )}

              {activeTab === 'platform' && (
                <AdminPlatformControlPanel
                  onNotify={(msg) => setNoticeMsg(msg)}
                  onConfigUpdated={() => loadOverview(true)}
                />
              )}
            </>
          )}
        </main>
      </div>

      {inspectAttemptId && (
        <AnswerSheetModal
          attemptId={inspectAttemptId}
          onClose={() => setInspectAttemptId(null)}
          onAttemptVoided={async () => {
            await notifyAndSync('Voided test attempt and synchronized institutional overview.');
          }}
        />
      )}
    </div>
  );
};
