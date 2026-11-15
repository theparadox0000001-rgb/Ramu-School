import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Gift,
  Headphones,
  Send,
  Share2,
} from 'lucide-react';
import type { StudentProfile, SupportTicket } from '../types/portal';

/* 1. SUBSCRIPTIONS VIEW */
export const SubscriptionsView: React.FC<{
  student: StudentProfile;
  onUpgradePlan: (programName: string) => void;
}> = ({ student, onUpgradePlan }) => {
  const [selectedPlan, setSelectedPlan] = useState(student.programName);
  const [confirmedMsg, setConfirmedMsg] = useState('');

  const plans = [
    {
      name: 'CBSE Grade 10 Science Full Program',
      audience: 'For Class 10 CBSE & Foundation learners',
      price: '₹12,999 / year',
      features: [
        'Live Interactive Classes + Recordings',
        'All 7 Subjects Syllabus & Formula Sheets',
        'Unlimited CYOT & Chapter Mock Tests',
        'AINA 24/7 AI Doubt Solver',
      ],
    },
    {
      name: 'IIT-JEE 2027 Comprehensive Program',
      audience: 'For JEE Main & Advanced Rankers',
      price: '₹24,500 / year',
      features: [
        'Sri Chaitanya Grand Test Series (AITS)',
        'Daily Live Problem-Solving Labs',
        'SCORE All-India Percentile Benchmarking',
        'AINA 24/7 Multimodal Doubt Resolution',
      ],
    },
    {
      name: 'NEET UG 2027 Target Medical Program',
      audience: 'For Medical & NCERT Line-by-Line Mastery',
      price: '₹22,900 / year',
      features: [
        'NCERT Biology & Chemistry Deep-Dive Decks',
        'Full-Length 720-Mark NTA Mock Series',
        '24/7 Doubt Resolution + Revision Flashcards',
        'Personalized Weak-Topic Practice Plans',
      ],
    },
  ];

  const handleActivate = (planName: string) => {
    setSelectedPlan(planName);
    onUpgradePlan(planName);
    setConfirmedMsg(`Active subscription updated to "${planName}".`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
          Subscriptions & Enrolled Programs
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage your active Infinity Learn program, renewal validity, and exam track upgrades.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-700 dark:text-blue-400 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Active Subscription · Valid until May 31, 2027
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display mt-0.5">
              {selectedPlan}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
              Enrollment ID: {student.admissionId}
            </p>
          </div>
        </div>
      </div>

      {confirmedMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{confirmedMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const isCurrent = selectedPlan === plan.name;
          return (
            <div
              key={plan.name}
              className={`rounded-2xl border p-6 flex flex-col justify-between gap-6 bg-white dark:bg-slate-900 ${
                isCurrent
                  ? 'border-blue-700 dark:border-blue-500'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {plan.audience}
                </p>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  {plan.name}
                </h3>
                <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                  {plan.price}
                </p>
                <ul className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={isCurrent}
                onClick={() => handleActivate(plan.name)}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer ${
                  isCurrent
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-default'
                    : 'bg-blue-700 hover:bg-blue-800 text-white'
                }`}
              >
                {isCurrent ? 'Current Active Plan' : 'Switch to This Program'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* 2. REFER AND EARN VIEW */
export const ReferEarnView: React.FC<{ student: StudentProfile }> = ({ student }) => {
  const referralCode = `IL-${student.initials}-500`;
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitesSent, setInvitesSent] = useState<string[]>([
    'kabir.verma@school.edu',
    'riya.patel@school.edu',
  ]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(referralCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInvitesSent((prev) => [inviteEmail.trim(), ...prev]);
    setInviteEmail('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
          Refer and Earn
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Invite classmates to Infinity Learn. Both you and your friend earn ₹500 tuition credits upon enrollment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-700 dark:text-amber-400">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Your Personal Referral Code
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Share this code with friends joining CBSE, IIT-JEE, or NEET programs.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <span className="text-lg font-bold font-mono tracking-wider text-blue-700 dark:text-blue-400">
              {referralCode}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>

          <form onSubmit={handleSendInvite} className="space-y-2.5 pt-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Send Direct Email Invite
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="classmate@example.com"
                className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Send Invite</span>
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              Referral Credits
            </h2>
            <span className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
              ₹{(invitesSent.length * 500).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Recent invitations ({invitesSent.length}):
          </p>
          <div className="space-y-2">
            {invitesSent.map((email) => (
              <div
                key={email}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between"
              >
                <span className="font-medium text-slate-800 dark:text-slate-200">{email}</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  ₹500 Pending
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* 3. CONTACT US / ACADEMIC SUPPORT VIEW */
export const ContactUsView: React.FC<{
  student: StudentProfile;
  tickets: SupportTicket[];
  onSubmitTicket: (ticket: SupportTicket) => void;
}> = ({ student, tickets, onSubmitTicket }) => {
  const [category, setCategory] = useState('Academic Doubt & Class Schedule');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submittedNotice, setSubmittedNotice] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    onSubmitTicket({
      id: `TKT-${Math.floor(1000 + Math.random() * 9000)}`,
      category,
      subject: subject.trim(),
      message: message.trim(),
      status: 'Open',
      createdAt: 'Just now',
    });
    setSubject('');
    setMessage('');
    setSubmittedNotice('Support ticket logged. An academic counselor will reply within 2 hours.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
          Contact Us · Student Support Desk
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Reach Sri Chaitanya & Infinity Learn academic mentors, batch coordinators, or tech support.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Headphones className="w-4 h-4" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              Submit Support Request
            </h2>
          </div>

          {submittedNotice && (
            <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              {submittedNotice}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1">Issue Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option>Academic Doubt & Class Schedule</option>
              <option>Batch Transfer / Sri Chaitanya ID Mapping</option>
              <option>SCORE Test & Scholarship Query</option>
              <option>Billing & Subscription</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Subject</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of your request"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Details</label>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Describe how we can assist ${student.name} (${student.admissionId})...`}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit Support Ticket</span>
          </button>
        </form>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
            Your Support Tickets ({tickets.length})
          </h2>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">
              Academic Helpline · 8:00 AM – 10:00 PM IST
            </p>
            <p className="text-slate-600 dark:text-slate-400 font-mono">
              +91 1800-419-4247 · support@infinitylearn.com
            </p>
          </div>

          {tickets.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              No active tickets yet. Submit a request on the left and track its resolution here.
            </p>
          ) : (
            <div className="space-y-2.5">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                      {t.id}
                    </span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {t.status} · {t.createdAt}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">{t.subject}</p>
                  <p className="text-slate-600 dark:text-slate-400">{t.category}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
