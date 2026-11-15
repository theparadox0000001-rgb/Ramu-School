import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Moon,
  Phone,
  ShieldCheck,
  Smartphone,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import type { ExamTrack, LoginMethod, PortalRole, StudentProfile } from '../types/portal';
import { PORTAL_IMAGES } from '../data/curriculumData';
import { portalApi, setSessionToken } from '../services/api';

interface LoginScreenProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLoginSuccess: (profile: StudentProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  darkMode,
  onToggleDarkMode,
  onLoginSuccess,
}) => {
  const [authRole, setAuthRole] = useState<PortalRole>('student');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('otp');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<ExamTrack>('IIT-JEE');

  // Phone + OTP state
  const [phone, setPhone] = useState('9848042190');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  // Username & Password state
  const [username, setUsername] = useState('ananya.sharma@student.infinitylearn.com');
  const [facultyEmail, setFacultyEmail] = useState('ekansh.mishra@teacher.infinitylearn.com');
  const [parentEmail, setParentEmail] = useState('parent@ramuschool.edu');
  const [adminEmail, setAdminEmail] = useState('admin@infinitylearn.com');
  const [facultyNameInput, setFacultyNameInput] = useState('Ekansh Mishra');
  const [password, setPassword] = useState('Infinity@2027');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetNotice, setResetNotice] = useState('');

  // Admission / Faculty / Parent / Admin ID state
  const [admissionId, setAdmissionId] = useState('SC-HYD-26-4419');
  const [facultyId, setFacultyId] = useState('SC-FAC-2026-118');
  const [parentId, setParentId] = useState('SC-PAR-2026-001');
  const [adminId, setAdminId] = useState('SC-ADM-2026-001');
  const [dobPin, setDobPin] = useState('2009-05-14');

  // Registration state
  const [fullName, setFullName] = useState('');
  const [regGrade, setRegGrade] = useState('Class 12');

  // Support drawer, loading & validation error
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = window.setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendTimer]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await portalApi.sendOtp(digits, authRole);
      setOtpSent(true);
      setResendTimer(30);
      setOtpCode(res.demoOtp || '1234');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send OTP.');
    } finally {
      setSubmitting(false);
    }
  };

  const switchAuthRole = (role: PortalRole) => {
    setAuthRole(role);
    setIsRegisterMode(false);
    setErrorMsg('');
    setOtpSent(false);
    setOtpCode('');
    if (role === 'teacher') {
      setLoginMethod('password');
      setDobPin('1992-08-21');
    } else if (role === 'parent') {
      setLoginMethod('password');
      setPhone('9848099001');
      setDobPin('1982-03-14');
    } else if (role === 'admin') {
      setLoginMethod('password');
      setPhone('9848000100');
      setDobPin('1988-01-15');
    } else {
      setLoginMethod('otp');
      setPhone('9848042190');
      setDobPin('2009-05-14');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (otpCode.trim().length < 4) {
      setErrorMsg('Enter the 4-digit verification code sent to your mobile.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await portalApi.verifyOtp({
        phone,
        otp: otpCode,
        role: authRole,
        track: selectedTrack,
        name:
          authRole === 'teacher'
            ? facultyNameInput
            : authRole === 'admin'
            ? 'Raghavendra Rao'
            : authRole === 'parent'
            ? 'Meera Sharma'
            : fullName,
        grade: regGrade,
      });
      setSessionToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'OTP verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const activeIdentifier =
      authRole === 'admin'
        ? adminEmail
        : authRole === 'teacher'
        ? facultyEmail
        : authRole === 'parent'
        ? parentEmail
        : username;
    if (!activeIdentifier.trim() || password.length < 4) {
      setErrorMsg('Please enter both your registered email/ID and password.');
      return;
    }
    setSubmitting(true);
    try {
      const res =
        isRegisterMode && authRole === 'student'
          ? await portalApi.register({
              name: fullName.trim() || 'Student User',
              email: activeIdentifier.trim(),
              phone,
              password,
              role: 'student',
              track: selectedTrack,
              grade: regGrade,
            })
          : await portalApi.loginWithPassword({
              identifier: activeIdentifier.trim(),
              password,
              role: authRole,
              track: selectedTrack,
            });
      setSessionToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdmissionLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const activeId =
      authRole === 'admin'
        ? adminId
        : authRole === 'teacher'
        ? facultyId
        : authRole === 'parent'
        ? parentId
        : admissionId;
    if (!activeId.trim() || !dobPin.trim()) {
      setErrorMsg(
        authRole === 'admin'
          ? 'Enter your Institutional Admin ID and Security PIN Date.'
          : authRole === 'teacher'
          ? 'Enter your Employee / Faculty ID and Campus PIN.'
          : authRole === 'parent'
          ? 'Enter your Parent Guardian ID and Verification Date.'
          : 'Enter your School Admission ID and Date of Birth.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await portalApi.loginWithId({
        admissionId: activeId.trim(),
        dobPin: dobPin.trim(),
        role: authRole,
        track: selectedTrack,
      });
      setSessionToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ID verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoAccess = async (track: ExamTrack) => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await portalApi.demoLogin('student', track);
      setSessionToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Demo login unavailable.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTeacherDemoAccess = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await portalApi.demoLogin('teacher');
      setSessionToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Teacher demo unavailable.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleParentDemoAccess = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await portalApi.demoLogin('parent');
      setSessionToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Parent demo unavailable.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminDemoAccess = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await portalApi.demoLogin('admin');
      setSessionToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Admin demo unavailable.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetNotice('');
    setErrorMsg('');
    try {
      const res = await portalApi.resetPassword({
        identifier: resetEmail.trim(),
        newPassword: resetNewPassword.trim() || undefined,
      });
      setResetNotice(res.message);
      setResetNewPassword('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process password reset.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Clean 3-zone Top Bar Contract */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display"
          >
            Ramu School
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => handleDemoAccess('IIT-JEE')}
              className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              IIT-JEE
            </button>
            <button
              type="button"
              onClick={() => handleDemoAccess('NEET UG')}
              className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              NEET UG
            </button>
            <button
              type="button"
              onClick={() => handleDemoAccess('CBSE Class 12')}
              className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              CBSE Boards
            </button>
            <button
              type="button"
              onClick={() => setHelpDrawerOpen(true)}
              className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Help Center
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleAdminDemoAccess}
              className="hidden sm:inline-flex px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Admin Demo
            </button>
            <button
              type="button"
              onClick={handleParentDemoAccess}
              className="hidden md:inline-flex px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Parent Demo
            </button>
            <button
              type="button"
              onClick={handleTeacherDemoAccess}
              className="hidden sm:inline-flex px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Teacher Demo
            </button>
            <button
              type="button"
              onClick={() =>
                authRole === 'admin'
                  ? handleAdminDemoAccess()
                  : authRole === 'teacher'
                  ? handleTeacherDemoAccess()
                  : authRole === 'parent'
                  ? handleParentDemoAccess()
                  : handleDemoAccess(selectedTrack)
              }
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {authRole === 'admin'
                ? 'Enter Admin Console'
                : authRole === 'teacher'
                ? 'Enter Teacher Portal'
                : authRole === 'parent'
                ? 'Enter Parent Portal'
                : 'Instant Demo Access'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Editorial Academic Overview */}
        <section className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="relative h-64 sm:h-72 w-full overflow-hidden bg-slate-200 dark:bg-slate-800">
            <img
              src={PORTAL_IMAGES.heroWorkspace}
              alt="Clean study desk with physics textbook and analytical charts"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent" />
            <div className="absolute bottom-5 left-6 right-6 text-white">
              <p className="text-xs font-medium text-slate-200 mb-1">
                Sri Chaitanya Academic Ecosystem · Grades 6–12, IIT-JEE & NEET
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance font-display">
                Focused preparation, unified in one workspace.
              </h1>
            </div>
          </div>

          <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white font-display">
                Everything inside your upgraded student portal
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Live Classes & Recordings
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Interactive faculty sessions with live concept polls, whiteboard slides, and on-demand archives.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    CYOT & NTA Test Engine
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Create Your Own Test by chapter and difficulty with +4/-1 scoring and question palettes.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    AINA 24/7 Doubt Mentor
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Upload textbook problems or type equations for guided hints or complete step-by-step proofs.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    SCORE & Flashcards
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Spaced-repetition formula recall decks paired with national SCORE percentile benchmarking.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-6 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                <span>1,400+ Concept Lectures</span>
                <span aria-hidden="true">·</span>
                <span>All-India SCORE Benchmarking</span>
              </div>
              <button
                type="button"
                onClick={onToggleDarkMode}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{darkMode ? 'Light Appearance' : 'Dark Appearance'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Right Multi-Mode Authentication Card */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 flex flex-col justify-between">
          <div>
            {/* Student vs Teacher vs Parent vs Admin Portal Switcher */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-5">
              <button
                type="button"
                onClick={() => switchAuthRole('student')}
                className={`py-2 px-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  authRole === 'student'
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Student Login
              </button>
              <button
                type="button"
                onClick={() => switchAuthRole('teacher')}
                className={`py-2 px-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  authRole === 'teacher'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Teacher Login
              </button>
              <button
                type="button"
                onClick={() => switchAuthRole('parent')}
                className={`py-2 px-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  authRole === 'parent'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Parent Login
              </button>
              <button
                type="button"
                onClick={() => switchAuthRole('admin')}
                className={`py-2 px-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  authRole === 'admin'
                    ? 'bg-slate-900 dark:bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Admin Portal
              </button>
            </div>

            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
                  {authRole === 'admin'
                    ? 'Sign in to Admin Console'
                    : authRole === 'teacher'
                    ? 'Sign in to Teacher Portal'
                    : authRole === 'parent'
                    ? 'Sign in to Parent Portal'
                    : isRegisterMode
                    ? 'Create Student Account'
                    : 'Sign in to Student Portal'}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {authRole === 'admin'
                    ? 'admin.ramuschool.edu · Institutional & Campus Operations'
                    : authRole === 'teacher'
                    ? 'teacher.ramuschool.edu · Sri Chaitanya Faculty Access'
                    : authRole === 'parent'
                    ? 'parent.ramuschool.edu · Child Progress, Attendance & Fee Telemetry'
                    : 'Choose your Ramu School student login method.'}
                </p>
              </div>
              {authRole === 'student' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode);
                    setErrorMsg('');
                  }}
                  className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer py-1"
                >
                  {isRegisterMode ? 'Already registered? Sign In' : 'New student? Sign Up'}
                </button>
              )}
            </div>

            {/* Official 3-Button Login Method Switcher */}
            <div
              role="tablist"
              aria-label="Login method"
              className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-6"
            >
              <button
                type="button"
                role="tab"
                aria-selected={loginMethod === 'otp'}
                onClick={() => {
                  setLoginMethod('otp');
                  setErrorMsg('');
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  loginMethod === 'otp'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>Phone + OTP</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={loginMethod === 'password'}
                onClick={() => {
                  setLoginMethod('password');
                  setErrorMsg('');
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  loginMethod === 'password'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {authRole === 'admin'
                    ? 'Admin Email'
                    : authRole === 'teacher'
                    ? 'Faculty Email'
                    : 'Password'}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={loginMethod === 'admission'}
                onClick={() => {
                  setLoginMethod('admission');
                  setErrorMsg('');
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  loginMethod === 'admission'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {authRole === 'admin'
                    ? 'Staff ID'
                    : authRole === 'teacher'
                    ? 'Employee ID'
                    : 'Admission ID'}
                </span>
              </button>
            </div>

            {/* Target Exam Track Selector (Student Mode Only) */}
            {authRole === 'student' ? (
              <div className="mb-5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Target Academic Track
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['IIT-JEE', 'NEET UG', 'CBSE Class 12', 'CBSE Grade 10'] as ExamTrack[]).map(
                    (track) => (
                      <button
                        key={track}
                        type="button"
                        onClick={() => setSelectedTrack(track)}
                        className={`py-2 px-2.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap truncate cursor-pointer ${
                          selectedTrack === track
                            ? 'border-blue-700 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {track}
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : authRole === 'teacher' ? (
              <div className="mb-5">
                <label
                  htmlFor="faculty-name-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Faculty Display Name
                </label>
                <input
                  id="faculty-name-input"
                  type="text"
                  value={facultyNameInput}
                  onChange={(e) => setFacultyNameInput(e.target.value)}
                  placeholder="e.g., Ekansh Mishra"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            ) : authRole === 'parent' ? (
              <div className="mb-5 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 text-xs text-slate-700 dark:text-slate-300">
                Parent Portal connects directly to your child&apos;s live attendance, AITS accuracy, weak topic alerts, mentorship bookings, and fee invoices.
              </div>
            ) : (
              <div className="mb-5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300">
                Admin privileges include RBAC account provisioning, cohort & campus management, commerce/coupon control, OS health telemetry, and audit logs.
              </div>
            )}

            {/* Optional Registration Fields */}
            {isRegisterMode && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Student Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Rohan Deshmukh"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Current Grade
                  </label>
                  <select
                    value={regGrade}
                    onChange={(e) => setRegGrade(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option>Class 10</option>
                    <option>Class 11</option>
                    <option>Class 12</option>
                    <option>Dropper / Repeater</option>
                  </select>
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="mb-4 px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs font-medium text-red-700 dark:text-red-300"
              >
                {errorMsg}
              </div>
            )}

            {/* Method 1: Phone + OTP */}
            {loginMethod === 'otp' && (
              <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="phone-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Registered Mobile Number
                  </label>
                  <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden focus-within:ring-2 focus-within:ring-blue-600">
                    <span className="px-3 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 tabular-nums">
                      +91
                    </span>
                    <input
                      id="phone-input"
                      type="tel"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      disabled={otpSent}
                      placeholder="10-digit mobile number"
                      className="flex-1 px-3.5 py-2.5 text-sm bg-transparent focus:outline-none tabular-nums disabled:opacity-60"
                    />
                    {otpSent && (
                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setOtpCode('');
                        }}
                        className="px-3 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>

                {otpSent && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="otp-input"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Enter 4-Digit OTP
                      </label>
                      <button
                        type="button"
                        disabled={resendTimer > 0}
                        onClick={() => setResendTimer(30)}
                        className="text-xs font-medium text-blue-700 dark:text-blue-400 disabled:text-slate-400 cursor-pointer tabular-nums"
                      >
                        {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                      </button>
                    </div>
                    <input
                      id="otp-input"
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter OTP (demo: 1234)"
                      className="w-full px-3.5 py-2.5 text-base tracking-widest font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      OTP pre-filled for instant verification preview.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>
                    {submitting
                      ? 'Authenticating...'
                      : otpSent
                      ? 'Verify OTP & Enter Portal'
                      : 'Send Verification OTP'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Method 2: Username & Password */}
            {loginMethod === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="username-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {authRole === 'admin'
                      ? 'Administrator Email'
                      : authRole === 'teacher'
                      ? 'Faculty Email (Infinity Learn / Sri Chaitanya)'
                      : authRole === 'parent'
                      ? 'Parent / Guardian Email'
                      : 'Student Email or Username'}
                  </label>
                  <input
                    id="username-input"
                    type="text"
                    value={
                      authRole === 'admin'
                        ? adminEmail
                        : authRole === 'teacher'
                        ? facultyEmail
                        : authRole === 'parent'
                        ? parentEmail
                        : username
                    }
                    onChange={(e) =>
                      authRole === 'admin'
                        ? setAdminEmail(e.target.value)
                        : authRole === 'teacher'
                        ? setFacultyEmail(e.target.value)
                        : authRole === 'parent'
                        ? setParentEmail(e.target.value)
                        : setUsername(e.target.value)
                    }
                    placeholder={
                      authRole === 'admin'
                        ? 'admin@infinitylearn.com'
                        : authRole === 'teacher'
                        ? 'faculty@teacher.infinitylearn.com'
                        : authRole === 'parent'
                        ? 'parent@ramuschool.edu'
                        : 'student@infinitylearn.com'
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="password-input"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotPasswordOpen(!forgotPasswordOpen);
                        setResetNotice('');
                      }}
                      className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>Keep me signed in on this device</span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3 px-4 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 ${
                    authRole === 'admin'
                      ? 'bg-slate-900 hover:bg-slate-800 dark:bg-emerald-700 dark:hover:bg-emerald-800'
                      : authRole === 'teacher'
                      ? 'bg-sky-600 hover:bg-sky-700'
                      : authRole === 'parent'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-blue-700 hover:bg-blue-800'
                  }`}
                >
                  <span>
                    {authRole === 'admin'
                      ? 'Sign In to Admin Console'
                      : authRole === 'teacher'
                      ? 'Sign In to Teacher Console'
                      : authRole === 'parent'
                      ? 'Sign In to Parent Portal'
                      : isRegisterMode
                      ? 'Create Account & Continue'
                      : 'Sign In with Password'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {forgotPasswordOpen && (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2.5">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {authRole === 'teacher'
                        ? 'Reset Faculty Password'
                        : authRole === 'parent'
                        ? 'Reset Parent Password'
                        : 'Reset Account Password'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="Registered email or ID"
                        className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <input
                        type="password"
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="New password (optional)"
                        className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handlePasswordReset}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer whitespace-nowrap"
                      >
                        Reset / Send Link
                      </button>
                    </div>
                    {resetNotice && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{resetNotice}</span>
                      </p>
                    )}
                  </div>
                )}
              </form>
            )}

            {/* Method 3: School Admission ID, Faculty ID, Parent ID or Admin Staff ID */}
            {loginMethod === 'admission' && (
              <form onSubmit={handleAdmissionLogin} className="space-y-4">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    {authRole === 'admin'
                      ? 'For Academic Operations Administrators. Grants RBAC, Batch, AITS, Commerce, and OS Audit Console access.'
                      : authRole === 'teacher'
                      ? 'For Sri Chaitanya & Ramu School faculty members. Links your assigned live class batches, attendance rosters, and DPP assignments automatically.'
                      : authRole === 'parent'
                      ? 'For parents and guardians. Enter your Guardian ID (e.g., SC-PAR-2026-001) to view linked student attendance, scores, and fee invoices.'
                      : 'For enrolled Sri Chaitanya Academy and partner school students. Links your classroom batch, AITS schedule, and SCORE rank automatically.'}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="admission-id-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {authRole === 'admin'
                      ? 'Admin Staff ID'
                      : authRole === 'teacher'
                      ? 'Faculty / Employee ID'
                      : authRole === 'parent'
                      ? 'Guardian / Parent ID'
                      : 'Admission / Roll ID'}
                  </label>
                  <input
                    id="admission-id-input"
                    type="text"
                    value={
                      authRole === 'admin'
                        ? adminId
                        : authRole === 'teacher'
                        ? facultyId
                        : authRole === 'parent'
                        ? parentId
                        : admissionId
                    }
                    onChange={(e) =>
                      authRole === 'admin'
                        ? setAdminId(e.target.value)
                        : authRole === 'teacher'
                        ? setFacultyId(e.target.value)
                        : authRole === 'parent'
                        ? setParentId(e.target.value)
                        : setAdmissionId(e.target.value)
                    }
                    placeholder={
                      authRole === 'admin'
                        ? 'e.g., SC-ADM-2026-001'
                        : authRole === 'teacher'
                        ? 'e.g., SC-FAC-2026-118'
                        : authRole === 'parent'
                        ? 'e.g., SC-PAR-2026-001'
                        : 'e.g., SC-HYD-26-4419'
                    }
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="dob-pin-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {authRole === 'admin'
                      ? 'Security PIN Date'
                      : authRole === 'teacher'
                      ? 'Date of Birth / Campus Verification Date'
                      : authRole === 'parent'
                      ? 'Guardian Verification Date'
                      : 'Date of Birth / Campus PIN'}
                  </label>
                  <input
                    id="dob-pin-input"
                    type="date"
                    value={dobPin}
                    onChange={(e) => setDobPin(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3 px-4 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 ${
                    authRole === 'admin'
                      ? 'bg-slate-900 hover:bg-slate-800 dark:bg-emerald-700 dark:hover:bg-emerald-800'
                      : authRole === 'teacher'
                      ? 'bg-sky-600 hover:bg-sky-700'
                      : authRole === 'parent'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-blue-700 hover:bg-blue-800'
                  }`}
                >
                  <span>
                    {authRole === 'admin'
                      ? 'Verify Staff ID & Open Admin Console'
                      : authRole === 'teacher'
                      ? 'Verify Faculty ID & Open Console'
                      : authRole === 'parent'
                      ? 'Verify Parent ID & Open Portal'
                      : 'Verify Admission ID & Enter Portal'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>

          {/* Quick Demo Switchers & Support */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                One-click preview accounts:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleAdminDemoAccess}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Admin (Raghavendra Rao)
                </button>
                <button
                  type="button"
                  onClick={handleTeacherDemoAccess}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Teacher (Ekansh Mishra)
                </button>
                <button
                  type="button"
                  onClick={handleParentDemoAccess}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Parent (Meera Sharma)
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoAccess('IIT-JEE')}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  IIT-JEE Student
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoAccess('NEET UG')}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  NEET UG Student
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Protected student session</span>
              <button
                type="button"
                onClick={() => setHelpDrawerOpen(true)}
                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Login Trouble? Contact Student Desk</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Support Help Drawer Modal */}
      {helpDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Student Support Desk"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Student Login Help Desk
              </h3>
              <button
                type="button"
                aria-label="Close help dialog"
                onClick={() => setHelpDrawerOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <Phone className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    OTP Not Received?
                  </p>
                  <p className="text-xs mt-0.5">
                    Use demo OTP <span className="font-mono font-semibold">1234</span> or switch to Username & Password / Admission ID login tabs.
                  </p>
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <BookOpen className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    Sri Chaitanya Campus Mapping
                  </p>
                  <p className="text-xs mt-0.5">
                    Enter your campus Admission ID (e.g. <span className="font-mono">SC-HYD-26-4419</span>) to synchronize offline AITS & batch timetables.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setHelpDrawerOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setHelpDrawerOpen(false);
                  handleDemoAccess(selectedTrack);
                }}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 cursor-pointer"
              >
                Open Demo Portal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
