import React, { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Compass,
  Download,
  Play,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type {
  ChapterItem,
  ExamTrack,
  LeaderboardEntry,
  StudentProfile,
  TestAttemptRecord,
} from '../types/portal';
import { BATCH_LEADERBOARD } from '../data/curriculumData';

interface ScoreAnalyticsModuleProps {
  student: StudentProfile;
  chapters: ChapterItem[];
  testHistory: TestAttemptRecord[];
  leaderboard?: LeaderboardEntry[];
  onPracticeWeakChapter: (chapterId: string) => void;
}

export const ScoreAnalyticsModule: React.FC<ScoreAnalyticsModuleProps> = ({
  student,
  chapters,
  testHistory,
  leaderboard,
  onPracticeWeakChapter,
}) => {
  const activeLeaderboard = leaderboard && leaderboard.length > 0 ? leaderboard : BATCH_LEADERBOARD;
  const [scoreRegistered, setScoreRegistered] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Interactive Rank & College Predictor state
  const [predictorExam, setPredictorExam] = useState<'JEE Main' | 'NEET UG'>('JEE Main');
  const [jeeScore, setJeeScore] = useState(215); // out of 300
  const [neetScore, setNeetScore] = useState(635); // out of 720

  const avgAccuracy = useMemo(() => {
    if (testHistory.length === 0) return 0;
    return Math.round(
      testHistory.reduce((acc, t) => acc + t.accuracyPercent, 0) / testHistory.length
    );
  }, [testHistory]);

  const projectedPercentile = useMemo(() => {
    const base = 78 + avgAccuracy * 0.22;
    return Math.min(99.8, Number(base.toFixed(1)));
  }, [avgAccuracy]);

  const scholarshipTier = useMemo(() => {
    if (projectedPercentile >= 97) return '80% Merit Tuition Waiver';
    if (projectedPercentile >= 92) return '50% Merit Tuition Waiver';
    return '25% Merit Scholarship';
  }, [projectedPercentile]);

  const predictorOutcome = useMemo(() => {
    if (predictorExam === 'JEE Main') {
      const pct = Math.min(99.98, Math.max(45, 52 + (jeeScore / 300) * 48));
      const estRank = Math.max(120, Math.round(((100 - pct) / 100) * 1200000));
      const colleges =
        jeeScore >= 240
          ? 'NIT Trichy (CSE), NIT Surathkal (CSE), IIIT Hyderabad'
          : jeeScore >= 185
          ? 'NIT Warangal (ECE), NIT Calicut (CSE), DTU Delhi'
          : jeeScore >= 130
          ? 'NIT Kurukshetra, IIIT Jabalpur, State Govt. Engineering'
          : 'Qualifies for JEE Advanced Prep Tier · Target +45 marks in Mock Sprints';
      return {
        percentile: pct.toFixed(2),
        rankRange: `${Math.max(1, estRank - 450).toLocaleString()} – ${(estRank + 450).toLocaleString()}`,
        colleges,
      };
    } else {
      const pct = Math.min(99.98, Math.max(40, 44 + (neetScore / 720) * 56));
      const estRank = Math.max(85, Math.round(((100 - pct) / 100) * 2100000));
      const colleges =
        neetScore >= 660
          ? 'AIIMS Rishikesh, Maulana Azad Medical College, JIPMER Puducherry'
          : neetScore >= 605
          ? 'State Top Government Medical Colleges (MBBS Quota)'
          : neetScore >= 520
          ? 'Semi-Government / State Quota Medical Colleges'
          : 'Target +60 marks via NCERT Line-by-Line Biology Drills';
      return {
        percentile: pct.toFixed(2),
        rankRange: `${Math.max(1, estRank - 600).toLocaleString()} – ${(estRank + 600).toLocaleString()}`,
        colleges,
      };
    }
  }, [predictorExam, jeeScore, neetScore]);

  const handleDownloadReport = () => {
    const lines = [
      `INFINITY LEARN — SCORE & PERFORMANCE REPORT`,
      `Student: ${student.name} (${student.admissionId})`,
      `Target Track: ${student.track} · ${student.grade}`,
      `Projected All-India Percentile: ${projectedPercentile} %ile`,
      `SCORE Scholarship Tier: ${scholarshipTier}`,
      `Average Mock Accuracy: ${avgAccuracy}%`,
      `\nTEST ATTEMPTS:`,
      ...testHistory.map(
        (t) =>
          `- ${t.dateLabel} | ${t.testTitle} | Score: ${t.score}/${t.maxScore} | Accuracy: ${t.accuracyPercent}%`
      ),
      `\nCHAPTER MASTERY MATRIX:`,
      ...chapters.map((c) => `- ${c.subject} · ${c.title}: ${c.masteryPercent}%`),
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `infinity-learn-scorecard-${student.admissionId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // SVG Trend Chart Geometry
  const chartData = testHistory.slice(-7);
  const svgW = 640;
  const svgH = 220;
  const padX = 44;
  const padY = 24;
  const plotW = svgW - padX * 2;
  const plotH = svgH - padY * 2;

  const getPointCoords = (idx: number, pct: number) => {
    const x =
      chartData.length <= 1
        ? padX + plotW / 2
        : padX + (idx / (chartData.length - 1)) * plotW;
    const clamped = Math.max(0, Math.min(100, pct));
    const y = padY + plotH - (clamped / 100) * plotH;
    return { x, y };
  };

  const polylinePoints = chartData
    .map((item, idx) => {
      const { x, y } = getPointCoords(idx, item.accuracyPercent);
      return `${x},${y}`;
    })
    .join(' ');

  const rankLabelByTrack: Record<ExamTrack, string> = {
    'IIT-JEE': 'Est. AIR Band: 2,400 – 3,100',
    'NEET UG': 'Est. AIR Band: 3,200 – 4,500',
    'CBSE Class 12': 'Projected Board Score: 96.4%',
    'CBSE Grade 10': 'Projected Board Score: 97.2%',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            SCORE, Rank Predictor & Analytics
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            National scholarship benchmarking, live Rank Predictor, batch leaderboard, and weak-topic diagnostics.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadReport}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap w-fit"
        >
          <Download className="w-4 h-4" />
          <span>Download Scorecard (.txt)</span>
        </button>
      </div>

      {/* SCORE National Scholarship & Percentile Strip */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
            <Award className="w-4 h-4" />
            <span>Infinity Learn SCORE · National Talent & Scholarship Benchmark</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-4 pt-1">
            <p className="text-3xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
              {projectedPercentile} %ile
            </p>
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {scholarshipTier}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {rankLabelByTrack[student.track]}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Based on {testHistory.length} evaluated mock & CYOT attempts · Avg accuracy {avgAccuracy}%.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setScoreRegistered(!scoreRegistered)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
              scoreRegistered
                ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-blue-700 hover:bg-blue-800 text-white'
            }`}
          >
            {scoreRegistered && <CheckCircle2 className="w-4 h-4" />}
            <span>
              {scoreRegistered
                ? 'Registered for Next SCORE Window'
                : 'Register for Upcoming SCORE Test'}
            </span>
          </button>
        </div>
      </section>

      {/* Interactive JEE / NEET Rank & College Predictor + Accuracy Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Rank & College Predictor */}
        <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Rank & College Predictor
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(['JEE Main', 'NEET UG'] as const).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPredictorExam(ex)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                    predictorExam === ex
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Expected {predictorExam} Score
              </span>
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                {predictorExam === 'JEE Main' ? `${jeeScore} / 300` : `${neetScore} / 720`}
              </span>
            </div>
            <input
              type="range"
              aria-label={`Expected ${predictorExam} score`}
              min={predictorExam === 'JEE Main' ? 40 : 180}
              max={predictorExam === 'JEE Main' ? 300 : 720}
              step={5}
              value={predictorExam === 'JEE Main' ? jeeScore : neetScore}
              onChange={(e) =>
                predictorExam === 'JEE Main'
                  ? setJeeScore(Number(e.target.value))
                  : setNeetScore(Number(e.target.value))
              }
              className="w-full accent-blue-700 cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Est. Percentile</p>
              <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {predictorOutcome.percentile} %ile
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Predicted AIR Band</p>
              <p className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
                {predictorOutcome.rankRange}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-blue-50/50 dark:bg-blue-950/20 text-xs space-y-1">
            <p className="font-semibold text-slate-900 dark:text-white">
              Best-Fit Target Institutes
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {predictorOutcome.colleges}
            </p>
          </div>
        </section>

        {/* Accuracy Trajectory Chart */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Accuracy Trajectory Across Tests
              </h2>
            </div>
            {hoveredIdx !== null && chartData[hoveredIdx] && (
              <div className="text-xs font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                {chartData[hoveredIdx].testTitle}:{' '}
                <strong>{chartData[hoveredIdx].accuracyPercent}%</strong> (
                {chartData[hoveredIdx].score}/{chartData[hoveredIdx].maxScore})
              </div>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full min-w-[420px] h-56"
              role="img"
              aria-label="Accuracy trend across recent tests"
            >
              {[25, 50, 75, 100].map((tick) => {
                const y = padY + plotH - (tick / 100) * plotH;
                return (
                  <g key={tick}>
                    <line
                      x1={padX}
                      y1={y}
                      x2={svgW - padX}
                      y2={y}
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padX - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              {chartData.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#1d4ed8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
              )}

              {chartData.map((item, idx) => {
                const { x, y } = getPointCoords(idx, item.accuracyPercent);
                const isHovered = hoveredIdx === idx;
                return (
                  <g
                    key={item.id}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 6 : 4.5}
                      className="fill-blue-700 stroke-white dark:stroke-slate-900"
                      strokeWidth="2"
                    />
                    <text
                      x={x}
                      y={svgH - 4}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                    >
                      {item.dateLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
      </div>

      {/* All-India & Batch Leaderboard */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              Batch & All-India Leaderboard
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Updated after every CYOT & AITS submission
          </span>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              <th className="py-3 px-6 font-semibold">Rank</th>
              <th className="py-3 px-4 font-semibold">Student</th>
              <th className="py-3 px-4 font-semibold">Track</th>
              <th className="py-3 px-4 font-semibold text-right">Tests</th>
              <th className="py-3 px-4 font-semibold text-right">Accuracy</th>
              <th className="py-3 px-6 font-semibold text-right">SCORE Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            {activeLeaderboard.map((row) => (
              <tr
                key={row.rank}
                className={
                  row.isCurrentUser
                    ? 'bg-blue-50/70 dark:bg-blue-950/30 font-semibold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }
              >
                <td className="py-3.5 px-6 font-mono font-bold tabular-nums">#{row.rank}</td>
                <td className="py-3.5 px-4">
                  <p className="text-slate-900 dark:text-white">
                    {row.isCurrentUser ? `${student.name} (You)` : row.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                    {row.city}
                  </p>
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                  {row.isCurrentUser ? student.track : row.track}
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                  {row.isCurrentUser ? testHistory.length + 9 : row.testsTaken}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-blue-700 dark:text-blue-400 tabular-nums">
                  {row.isCurrentUser ? `${avgAccuracy}%` : `${row.accuracyPercent}%`}
                </td>
                <td className="py-3.5 px-6 text-right font-mono font-bold tabular-nums">
                  {row.scorePoints.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Chapter Mastery & Weak-Topic Action Matrix */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
            Chapter Mastery & Weak-Topic Diagnosis
          </h2>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              <th className="py-3 px-6 font-semibold">Subject</th>
              <th className="py-3 px-4 font-semibold">Chapter</th>
              <th className="py-3 px-4 font-semibold">Exam Weightage</th>
              <th className="py-3 px-4 font-semibold text-right">Mastery</th>
              <th className="py-3 px-4 font-semibold">Readiness Status</th>
              <th className="py-3 px-6 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            {chapters.map((ch) => {
              const statusLabel =
                ch.masteryPercent >= 80
                  ? 'Strong'
                  : ch.masteryPercent >= 65
                  ? 'On Track'
                  : 'Needs Revision';
              const statusColor =
                ch.masteryPercent >= 80
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : ch.masteryPercent >= 65
                  ? 'text-blue-700 dark:text-blue-400'
                  : 'text-amber-700 dark:text-amber-400';

              return (
                <tr key={ch.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-6 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {ch.subject}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                    {ch.title}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400">
                    {ch.weightage}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums">
                    {ch.masteryPercent}%
                  </td>
                  <td className={`py-3.5 px-4 text-xs font-semibold ${statusColor}`}>
                    {statusLabel}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      type="button"
                      onClick={() => onPracticeWeakChapter(ch.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3 h-3" />
                      <span>Practice Topic</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
};
