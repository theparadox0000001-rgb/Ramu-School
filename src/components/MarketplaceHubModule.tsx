import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgePercent,
  CheckCircle2,
  CreditCard,
  FileText,
  GraduationCap,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Ticket,
  X,
} from 'lucide-react';
import type {
  CourseItem,
  EnrollmentItem,
  ExamTrack,
  OrderRecord,
  ScholarshipExam,
} from '../types/portal';
import { portalApi } from '../services/api';

interface MarketplaceHubModuleProps {
  studentTrack: ExamTrack;
  onRefreshWorkspace?: () => Promise<void> | void;
}

export const MarketplaceHubModule: React.FC<MarketplaceHubModuleProps> = ({
  studentTrack,
  onRefreshWorkspace,
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'my-courses' | 'scholarships'>('catalog');
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [scholarships, setScholarships] = useState<ScholarshipExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');

  const [trackFilter, setTrackFilter] = useState<'All' | ExamTrack>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Checkout Modal State
  const [checkoutCourse, setCheckoutCourse] = useState<CourseItem | null>(null);
  const [couponInput, setCouponInput] = useState('RAMU50');
  const [discountInr, setDiscountInr] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<OrderRecord['paymentMethod']>('UPI');
  const [submittingCheckout, setSubmittingCheckout] = useState(false);

  // Invoice Modal State
  const [invoiceOrder, setInvoiceOrder] = useState<OrderRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [mkt, sch] = await Promise.all([
        portalApi.getMarketplaceCourses(),
        portalApi.getScholarships(),
      ]);
      setCourses(mkt.courses);
      setEnrollments(mkt.enrollments);
      setOrders(mkt.orders);
      setScholarships(sch.scholarships);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load marketplace data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const enrolledCourseIds = useMemo(
    () => new Set(enrollments.filter((e) => e.status === 'Active').map((e) => e.courseId)),
    [enrollments]
  );

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return courses.filter((c) => {
      if (trackFilter !== 'All' && c.track !== trackFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.instructor.toLowerCase().includes(q) ||
        c.subjectFocus.toLowerCase().includes(q)
      );
    });
  }, [courses, trackFilter, searchQuery]);

  const openCheckout = async (course: CourseItem) => {
    setCheckoutCourse(course);
    setCouponInput('RAMU50');
    setDiscountInr(0);
    setAppliedCoupon(null);
    setCouponMessage('');
    setPaymentMethod('UPI');
    try {
      const res = await portalApi.validateCoupon(course.id, 'RAMU50');
      if (res.valid) {
        setDiscountInr(res.discountInr);
        setAppliedCoupon(res.code);
        setCouponMessage(res.message);
      }
    } catch {
      // ignore initial coupon check failure
    }
  };

  const handleApplyCoupon = async () => {
    if (!checkoutCourse || !couponInput.trim()) return;
    setCouponMessage('');
    try {
      const res = await portalApi.validateCoupon(checkoutCourse.id, couponInput.trim());
      setDiscountInr(res.discountInr);
      setAppliedCoupon(res.code);
      setCouponMessage(res.message);
    } catch (err) {
      setDiscountInr(0);
      setAppliedCoupon(null);
      setCouponMessage(err instanceof Error ? err.message : 'Invalid coupon code.');
    }
  };

  const handleCompleteCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutCourse) return;
    setSubmittingCheckout(true);
    setErrorMsg('');
    try {
      const res = await portalApi.checkoutCourse({
        courseId: checkoutCourse.id,
        couponCode: appliedCoupon || undefined,
        paymentMethod,
      });
      setNoticeMsg(
        `Enrolled in "${checkoutCourse.title}" · Invoice ${res.order.invoiceNo} generated.`
      );
      setCheckoutCourse(null);
      setInvoiceOrder(res.order);
      await loadData();
      if (onRefreshWorkspace) await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleRegisterScholarship = async (sch: ScholarshipExam) => {
    setErrorMsg('');
    try {
      const res = await portalApi.registerScholarship(sch.id);
      setNoticeMsg(`Registered for ${sch.code} · Admit Card: ${res.admitCardCode}`);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to register for scholarship.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Course Marketplace & Scholarships
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Structured Star Batches, AITS Test Series, GST Tax Invoices, and National RSAT Scholarship Tests · Track: {studentTrack}
          </p>
        </div>
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start">
          {(
            [
              { id: 'catalog', label: 'Course Store', count: courses.length },
              { id: 'my-courses', label: 'My Enrollments', count: enrollments.length },
              { id: 'scholarships', label: 'RSAT & Olympiads', count: scholarships.length },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === t.id
                  ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      </div>

      {noticeMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{noticeMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setNoticeMsg('')}
            className="text-emerald-700 dark:text-emerald-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs font-medium text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="p-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
          Loading courses, enrollments, and scholarship calendar...
        </div>
      ) : activeTab === 'catalog' ? (
        <div className="space-y-5">
          {/* Coupon Promo Strip + Filters */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
              <BadgePercent className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
              <span>
                Use promo code <strong className="font-mono text-blue-700 dark:text-blue-400">RAMU50</strong> for up to 50% Merit Waiver or{' '}
                <strong className="font-mono text-blue-700 dark:text-blue-400">SCHOLAR25</strong> for 25% off.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search batches or faculty..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              {(['All', 'IIT-JEE', 'NEET UG', 'CBSE Class 12', 'CBSE Grade 10'] as const).map(
                (tr) => (
                  <button
                    key={tr}
                    type="button"
                    onClick={() => setTrackFilter(tr)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                      trackFilter === tr
                        ? 'border-blue-700 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tr}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredCourses.map((course) => {
              const isEnrolled = enrolledCourseIds.has(course.id);
              const discountPct = Math.max(
                0,
                Math.round(((course.mrpInr - course.priceInr) / course.mrpInr) * 100)
              );
              return (
                <article
                  key={course.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-blue-700 dark:text-blue-400">
                        {course.track} · {course.badge}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums font-medium text-amber-600 dark:text-amber-400">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {course.rating} ({course.reviewsCount})
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug font-display">
                        {course.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                        {course.subtitle}
                      </p>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                      <span>Faculty: {course.instructor}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{course.durationMonths} Months</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {course.enrolledCount.toLocaleString()} enrolled
                      </span>
                    </div>

                    <ul className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {course.syllabusHighlights.map((hl, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>{hl}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums font-display">
                          Rs. {course.priceInr.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400 line-through tabular-nums">
                          Rs. {course.mrpInr.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {discountPct}% Academic Grant Applied
                      </p>
                    </div>

                    {isEnrolled ? (
                      <span className="px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold whitespace-nowrap shrink-0">
                        Active Access
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openCheckout(course)}
                        className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Enroll Now</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'my-courses' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
              Active Batch Subscriptions
            </h2>
            {enrollments.length === 0 ? (
              <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-500">
                No active course enrollments yet. Browse Course Store to unlock a structured cohort.
              </div>
            ) : (
              enrollments.map((enr) => (
                <div
                  key={enr.id}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {enr.courseTitle}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        Enrolled {enr.enrolledAt} · Valid until {enr.validUntil} · Status:{' '}
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {enr.status}
                        </span>
                      </p>
                    </div>
                    <GraduationCap className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1 tabular-nums">
                      <span>Syllabus Completion</span>
                      <span className="font-semibold">{enr.progressPercent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-700 dark:bg-blue-500 rounded-full"
                        style={{ width: `${enr.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white font-display">
              Fee Receipts & GST Invoices
            </h2>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              {orders.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No payment orders recorded yet.</div>
              ) : (
                orders.map((ord) => (
                  <div key={ord.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {ord.courseTitle}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        {ord.invoiceNo} · {ord.paymentMethod} · Rs.{' '}
                        {ord.amountPaidInr.toLocaleString()} · {ord.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInvoiceOrder(ord)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Invoice</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {scholarships.map((sch) => (
            <article
              key={sch.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                    {sch.code}
                  </span>
                  <span>
                    {sch.track} · {sch.status}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  {sch.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {sch.prizePool}
                </p>
                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 tabular-nums pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p>Exam Schedule: {sch.examDateLabel}</p>
                  <p>
                    Duration: {sch.durationMin} mins · Up to {sch.maxScholarshipPercent}% Waiver
                  </p>
                  <p>Registered Aspirants: {sch.registeredCount.toLocaleString()}</p>
                </div>
              </div>

              {sch.isRegistered ? (
                <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <Award className="w-4 h-4 shrink-0" />
                    <span>Registered · Admit Card Ready</span>
                  </p>
                  <p className="font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                    Hall Ticket: {sch.admitCardCode}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRegisterScholarship(sch)}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Free Scholarship Registration</span>
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutCourse && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                  Complete Batch Enrollment
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {checkoutCourse.title} · {checkoutCourse.durationMonths} Months Access
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutCourse(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCompleteCheckout} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Apply Scholarship / Promo Coupon
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="RAMU50 or SCHOLAR25"
                    className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Ticket className="w-3.5 h-3.5" />
                    <span>Apply</span>
                  </button>
                </div>
                {couponMessage && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1.5">
                    {couponMessage}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Payment Method
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['UPI', 'Card', 'NetBanking', 'EMI'] as const).map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPaymentMethod(pm)}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        paymentMethod === pm
                          ? 'border-blue-700 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2 text-xs tabular-nums">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Program Tuition Fee</span>
                  <span>Rs. {checkoutCourse.priceInr.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>Coupon Discount ({appliedCoupon || 'None'})</span>
                  <span>- Rs. {discountInr.toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-sm font-bold text-slate-900 dark:text-white">
                  <span>Total Payable (Incl. GST)</span>
                  <span>
                    Rs. {Math.max(0, checkoutCourse.priceInr - discountInr).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submittingCheckout}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {submittingCheckout
                    ? 'Processing Enrollment...'
                    : `Pay Rs. ${Math.max(
                        0,
                        checkoutCourse.priceInr - discountInr
                      ).toLocaleString()} & Unlock Access`}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* GST Invoice Modal */}
      {invoiceOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Ramu School · Tax Invoice
              </h3>
              <button
                type="button"
                onClick={() => setInvoiceOrder(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2 text-xs tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-500">Invoice Number</span>
                <span className="font-mono font-semibold">{invoiceOrder.invoiceNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order Reference</span>
                <span className="font-mono">{invoiceOrder.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Course / Batch</span>
                <span className="font-semibold text-right max-w-[60%]">
                  {invoiceOrder.courseTitle}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Mode</span>
                <span>{invoiceOrder.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Discount Saved</span>
                <span className="text-emerald-700 dark:text-emerald-400">
                  Rs. {invoiceOrder.discountInr.toLocaleString()}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-sm">
                <span>Amount Paid</span>
                <span>Rs. {invoiceOrder.amountPaidInr.toLocaleString()}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInvoiceOrder(null)}
              className="w-full py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
