import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, MinusCircle, Trash2, X, XCircle } from 'lucide-react';
import type { AdminAttemptDetailPayload } from '../../types/portal';
import { portalApi } from '../../services/api';

interface AnswerSheetModalProps {
  attemptId: string;
  onClose: () => void;
  onAttemptVoided?: () => Promise<void> | void;
}

export const AnswerSheetModal: React.FC<AnswerSheetModalProps> = ({
  attemptId,
  onClose,
  onAttemptVoided,
}) => {
  const [detail, setDetail] = useState<AdminAttemptDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [voiding, setVoiding] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await portalApi.getAdminAttemptDetail(attemptId);
      setDetail(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load answer sheet.');
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleVoidAttempt = async () => {
    setVoiding(true);
    setErrorMsg('');
    try {
      await portalApi.deleteAdminAttempt(attemptId);
      if (onAttemptVoided) {
        await onAttemptVoided();
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to void attempt.');
    } finally {
      setVoiding(false);
    }
  };

  const optionLetters = ['A', 'B', 'C', 'D'] as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Student Answer Sheet Inspection"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
              Attempt ID: {attemptId}
            </p>
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display truncate">
              {detail ? `${detail.attempt.studentName} · ${detail.attempt.testTitle}` : 'Answer Sheet Inspection'}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {detail && (
              <button
                type="button"
                disabled={voiding}
                onClick={() => void handleVoidAttempt()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{voiding ? 'Voiding...' : 'Void Attempt'}</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Close answer sheet"
              onClick={onClose}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs font-medium text-rose-800 dark:text-rose-300"
            >
              {errorMsg}
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-7 h-7 rounded-full border-2 border-blue-700 border-t-transparent animate-spin mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reconstructing question-by-question response sheet...
              </p>
            </div>
          ) : !detail ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              No attempt record found.
            </div>
          ) : (
            <>
              {/* Scoreboard Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 tabular-nums">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Score</p>
                  <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                    {detail.attempt.score}/{detail.attempt.maxScore}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Accuracy</p>
                  <p className="text-lg font-bold font-mono text-blue-700 dark:text-blue-400 mt-0.5">
                    {detail.attempt.accuracyPercent}%
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Correct / Wrong</p>
                  <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                    {detail.attempt.correctCount} / {detail.attempt.incorrectCount}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Skipped</p>
                  <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                    {detail.attempt.unattemptedCount}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Duration · Batch</p>
                  <p className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-1 truncate">
                    {detail.attempt.timeSpentMin}m · {detail.attempt.batchCode || 'ONLINE'}
                  </p>
                </div>
              </div>

              {/* Metadata line */}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {detail.attempt.admissionId} · {detail.attempt.studentEmail || 'No email'} ·{' '}
                {detail.attempt.category} · Submitted {detail.attempt.dateLabel}
              </p>

              {/* Question-by-Question Sheet */}
              {detail.items.length === 0 ? (
                <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                  This attempt recorded aggregate subject scores without individual question IDs.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {detail.items.map((item, idx) => {
                    const { question, selectedOptionIndex, isCorrect, isAttempted } = item;
                    return (
                      <div key={question.id} className="p-4 space-y-3 text-xs">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Q{idx + 1} · {question.subject} · {question.chapterTitle} ·{' '}
                              {question.difficulty}
                            </p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                              {question.prompt}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap shrink-0 ${
                              isCorrect
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : isAttempted
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {isCorrect ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Correct (+4)</span>
                              </>
                            ) : isAttempted ? (
                              <>
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Incorrect (-1)</span>
                              </>
                            ) : (
                              <>
                                <MinusCircle className="w-3.5 h-3.5" />
                                <span>Unattempted (0)</span>
                              </>
                            )}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {question.options.map((opt, oIdx) => {
                            const isCorrectOpt = oIdx === question.correctIndex;
                            const isSelectedOpt = oIdx === selectedOptionIndex;
                            let optStyle =
                              'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300';
                            if (isCorrectOpt) {
                              optStyle =
                                'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 font-semibold';
                            } else if (isSelectedOpt && !isCorrectOpt) {
                              optStyle =
                                'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 font-semibold';
                            }
                            return (
                              <div
                                key={oIdx}
                                className={`px-3 py-2 rounded-lg border flex items-center justify-between gap-2 ${optStyle}`}
                              >
                                <span className="truncate">
                                  <span className="font-mono font-bold mr-1.5">
                                    {optionLetters[oIdx]}.
                                  </span>
                                  {opt}
                                </span>
                                <span className="text-[11px] font-mono shrink-0">
                                  {isSelectedOpt && isCorrectOpt
                                    ? 'Picked · Key'
                                    : isSelectedOpt
                                    ? 'Student Pick'
                                    : isCorrectOpt
                                    ? 'Answer Key'
                                    : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="pt-1 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                          {question.formulaUsed && (
                            <p className="font-mono text-blue-700 dark:text-blue-400">
                              Formula: {question.formulaUsed}
                            </p>
                          )}
                          <p>{question.explanation}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
