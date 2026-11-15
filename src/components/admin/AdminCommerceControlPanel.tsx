import React, { useCallback, useEffect, useState } from 'react';
import {
  BadgePercent,
  CheckCircle2,
  CreditCard,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { AdminCommercePayload, AdminUserRecord, ExamTrack } from '../../types/portal';
import { portalApi } from '../../services/api';

interface AdminCommerceControlPanelProps {
  users: AdminUserRecord[];
  onNotify: (msg: string) => void;
}

export const AdminCommerceControlPanel: React.FC<AdminCommerceControlPanelProps> = ({
  users,
  onNotify,
}) => {
  const [commerce, setCommerce] = useState<AdminCommercePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Create Course state
  const [cTitle, setCTitle] = useState('');
  const [cSubtitle, setCSubtitle] = useState('');
  const [cTrack, setCTrack] = useState<ExamTrack>('IIT-JEE');
  const [cSubjectFocus, setCSubjectFocus] = useState('Physics · Chemistry · Maths');
  const [cInstructor, setCInstructor] = useState('Prof. Priya Menon');
  const [cPrice, setCPrice] = useState(4999);
  const [cMrp, setCMrp] = useState(9999);

  // Create Coupon state
  const [cpCode, setCpCode] = useState('');
  const [cpPercent, setCpPercent] = useState(30);
  const [cpMaxDisc, setCpMaxDisc] = useState(3000);

  // Manual Grant Enrollment state
  const [grantUserId, setGrantUserId] = useState(users.find((u) => u.role === 'student')?.id || '');
  const [grantCourseId, setGrantCourseId] = useState('');

  const loadCommerce = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await portalApi.getAdminCommerce();
      setCommerce(data);
      if (!grantCourseId && data.courses[0]) {
        setGrantCourseId(data.courses[0].id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load commerce ledger.');
    } finally {
      setLoading(false);
    }
  }, [grantCourseId]);

  useEffect(() => {
    void loadCommerce();
  }, [loadCommerce]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cTitle.trim()) return;
    setErrorMsg('');
    try {
      await portalApi.createAdminCourse({
        title: cTitle.trim(),
        subtitle: cSubtitle.trim() || 'Live Classes, AITS Test Series & AINA AI Access',
        track: cTrack,
        subjectFocus: cSubjectFocus,
        instructor: cInstructor,
        priceInr: Number(cPrice) || 4999,
        mrpInr: Number(cMrp) || 9999,
        isFeatured: true,
        status: 'Published',
      });
      setCTitle('');
      setCSubtitle('');
      onNotify('Published new course to Ramu School Marketplace.');
      await loadCommerce();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create course.');
    }
  };

  const handleUpsertCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpCode.trim()) return;
    try {
      await portalApi.upsertAdminCoupon({
        code: cpCode.trim().toUpperCase(),
        discountPercent: cpPercent,
        maxDiscountInr: cpMaxDisc,
        minOrderInr: 1000,
        usageLimit: 500,
        active: true,
      });
      onNotify(`Promo coupon ${cpCode.trim().toUpperCase()} activated.`);
      setCpCode('');
      await loadCommerce();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Coupon save failed.');
    }
  };

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantUserId || !grantCourseId) return;
    try {
      await portalApi.grantAdminEnrollment(grantUserId, grantCourseId);
      onNotify('Granted course batch access to student.');
      await loadCommerce();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to grant access.');
    }
  };

  const studentsOnly = users.filter((u) => u.role === 'student');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
            Marketplace, Subscriptions, Coupons & Revenue Ledger
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Full billing authority: publish batches, configure promo codes, grant free scholarships, or issue refunds.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadCommerce()}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {loading || !commerce ? (
        <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
          Loading revenue and course catalog...
        </div>
      ) : (
        <>
          {/* Revenue Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Net Collected Revenue</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums font-display">
                Rs. {commerce.revenueSummary.totalRevenueInr.toLocaleString()}
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Paid Tax Invoices</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums font-display">
                {commerce.revenueSummary.paidOrdersCount}
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Active Enrollments</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1 tabular-nums font-display">
                {commerce.revenueSummary.activeEnrollmentsCount}
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Refunded Orders</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums font-display">
                {commerce.revenueSummary.refundedOrdersCount}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left: Create Course + Published Catalog */}
            <div className="xl:col-span-7 space-y-5">
              <form
                onSubmit={handleCreateCourse}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                  <Plus className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Publish New Course / Batch SKU</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={cTitle}
                    onChange={(e) => setCTitle(e.target.value)}
                    placeholder="Course title (e.g., JEE Advanced 99%ile Sprint)"
                    className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <select
                    value={cTrack}
                    onChange={(e) => setCTrack(e.target.value as ExamTrack)}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="IIT-JEE">IIT-JEE</option>
                    <option value="NEET UG">NEET UG</option>
                    <option value="CBSE Class 12">CBSE Class 12</option>
                    <option value="CBSE Grade 10">CBSE Grade 10</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={cSubtitle}
                  onChange={(e) => setCSubtitle(e.target.value)}
                  placeholder="Subtitle / highlights"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <input
                    type="text"
                    value={cSubjectFocus}
                    onChange={(e) => setCSubjectFocus(e.target.value)}
                    placeholder="Subjects"
                    className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    value={cInstructor}
                    onChange={(e) => setCInstructor(e.target.value)}
                    placeholder="Lead Faculty"
                    className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    value={cPrice}
                    onChange={(e) => setCPrice(Number(e.target.value))}
                    placeholder="Price INR"
                    className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums"
                  />
                  <input
                    type="number"
                    value={cMrp}
                    onChange={(e) => setCMrp(Number(e.target.value))}
                    placeholder="MRP INR"
                    className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                >
                  Publish to Storefront
                </button>
              </form>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                  Course Catalog ({commerce.courses.length})
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {commerce.courses.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{c.title}</p>
                        <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                          {c.track} · Rs. {c.priceInr.toLocaleString()} · {c.enrolledCount} enrolled ·{' '}
                          {c.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            const nextStatus = c.status === 'Published' ? 'Archived' : 'Published';
                            await portalApi.updateAdminCourse(c.id, { status: nextStatus });
                            onNotify(`Course "${c.title}" set to ${nextStatus}.`);
                            await loadCommerce();
                          }}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          {c.status === 'Published' ? 'Archive' : 'Publish'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await portalApi.deleteAdminCourse(c.id);
                            onNotify(`Deleted course "${c.title}".`);
                            await loadCommerce();
                          }}
                          className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Coupons, Grant Enrollment & Orders/Refunds */}
            <div className="xl:col-span-5 space-y-5">
              <form
                onSubmit={handleGrantAccess}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                  <UserPlus className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>Direct Complimentary Enrollment Grant</span>
                </h3>
                <select
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  {studentsOnly.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.admissionId})
                    </option>
                  ))}
                </select>
                <select
                  value={grantCourseId}
                  onChange={(e) => setGrantCourseId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  {commerce.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full py-2 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Grant Immediate Batch Access</span>
                </button>
              </form>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                  <BadgePercent className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Scholarship & Promo Coupons</span>
                </h3>
                <form onSubmit={handleUpsertCoupon} className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={cpCode}
                    onChange={(e) => setCpCode(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    value={cpPercent}
                    onChange={(e) => setCpPercent(Number(e.target.value))}
                    placeholder="% Off"
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 tabular-nums"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                  >
                    Save Code
                  </button>
                </form>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {commerce.coupons.map((cp) => (
                    <div
                      key={cp.code}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs tabular-nums"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {cp.code}
                        </span>{' '}
                        <span className="text-slate-500">
                          · {cp.discountPercent}% off (max Rs. {cp.maxDiscountInr}) · {cp.usedCount}/
                          {cp.usageLimit}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await portalApi.toggleAdminCoupon(cp.code, !cp.active);
                          await loadCommerce();
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                          cp.active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}
                      >
                        {cp.active ? 'Active' : 'Paused'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                  <CreditCard className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Orders & Refunds ({commerce.orders.length})</span>
                </h3>
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {commerce.orders.map((o) => (
                    <div
                      key={o.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate">
                          {o.studentName} · Rs. {o.amountPaidInr.toLocaleString()}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 truncate tabular-nums">
                          {o.invoiceNo} · {o.courseTitle} · {o.status}
                        </p>
                      </div>
                      {o.status === 'Paid' ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await portalApi.refundAdminOrder(o.id);
                            onNotify(`Issued refund for ${o.invoiceNo} and revoked course access.`);
                            await loadCommerce();
                          }}
                          className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Refund</span>
                        </button>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold shrink-0">
                          {o.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
