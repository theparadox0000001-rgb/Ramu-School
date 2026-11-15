import React, { useMemo, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  RotateCw,
  Shuffle,
} from 'lucide-react';
import type { FlashcardItem, FlashcardStatus, SubjectName } from '../types/portal';

interface FlashcardsModuleProps {
  flashcards: FlashcardItem[];
  onUpdateStatus: (id: string, status: FlashcardStatus) => void;
  onToggleBookmark: (id: string) => void;
}

export const FlashcardsModule: React.FC<FlashcardsModuleProps> = ({
  flashcards,
  onUpdateStatus,
  onToggleBookmark,
}) => {
  const [subjectFilter, setSubjectFilter] = useState<'All' | SubjectName>('All');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const deck = useMemo(() => {
    const filtered = flashcards.filter((card) => {
      const matchSubj = subjectFilter === 'All' || card.subject === subjectFilter;
      const matchBm = !bookmarkedOnly || card.bookmarked;
      return matchSubj && matchBm;
    });
    if (shuffleSeed === 0) return filtered;
    const copy = [...filtered];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = (i * 7 + shuffleSeed * 3) % (i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }, [flashcards, subjectFilter, bookmarkedOnly, shuffleSeed]);

  const safeIndex = deck.length > 0 ? Math.min(currentIndex, deck.length - 1) : 0;
  const activeCard = deck[safeIndex];

  const masteredCount = flashcards.filter((c) => c.status === 'mastered').length;
  const practiceCount = flashcards.filter((c) => c.status === 'practice').length;

  const handleRateCard = (status: FlashcardStatus) => {
    if (!activeCard) return;
    onUpdateStatus(activeCard.id, status);
    setIsFlipped(false);
    setShowHint(false);
    if (deck.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % deck.length);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Revision Flashcards
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            High-yield formulas, mechanisms, and NCERT facts with active-recall grading.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
          <span>
            Mastered: <strong className="font-mono text-emerald-700 dark:text-emerald-400">{masteredCount}/{flashcards.length}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Needs Practice: <strong className="font-mono text-amber-700 dark:text-amber-400">{practiceCount}</strong>
          </span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          {(['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology'] as const).map((subj) => (
            <button
              key={subj}
              type="button"
              onClick={() => {
                setSubjectFilter(subj);
                setCurrentIndex(0);
                setIsFlipped(false);
                setShowHint(false);
              }}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subjectFilter === subj
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {subj}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setBookmarkedOnly(!bookmarkedOnly);
              setCurrentIndex(0);
              setIsFlipped(false);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border cursor-pointer whitespace-nowrap ${
              bookmarkedOnly
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Bookmarked Only</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShuffleSeed((s) => s + 1);
              setCurrentIndex(0);
              setIsFlipped(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Shuffle Deck</span>
          </button>
        </div>
      </div>

      {/* Flashcard Stage */}
      {!activeCard ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            No flashcards match this filter
          </p>
          <button
            type="button"
            onClick={() => {
              setSubjectFilter('All');
              setBookmarkedOnly(false);
            }}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white cursor-pointer"
          >
            Reset Deck Filters
          </button>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              Card {safeIndex + 1} of {deck.length} · {activeCard.subject} · {activeCard.chapter}
            </span>
            <span className="capitalize font-medium text-slate-700 dark:text-slate-300">
              Status: {activeCard.status === 'practice' ? 'Needs Practice' : activeCard.status}
            </span>
          </div>

          {/* 3D Flip Card */}
          <div className="perspective-1000">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsFlipped(!isFlipped)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setIsFlipped(!isFlipped);
                }
              }}
              aria-label="Flip flashcard to reveal answer"
              className={`relative w-full min-h-[300px] transition-transform duration-300 transform-style-3d cursor-pointer ${
                isFlipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* Front */}
              <div className="absolute inset-0 backface-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                    Prompt · {activeCard.subject}
                  </span>
                  <button
                    type="button"
                    aria-label={activeCard.bookmarked ? 'Remove bookmark' : 'Bookmark card'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleBookmark(activeCard.id);
                    }}
                    className={`p-1.5 rounded-lg cursor-pointer ${
                      activeCard.bookmarked
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                </div>

                <div className="my-auto py-4 text-center space-y-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-display text-balance leading-snug">
                    {activeCard.front}
                  </h2>
                  {showHint && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 inline-block">
                      Hint: {activeCard.hint}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowHint(!showHint);
                    }}
                    className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{showHint ? 'Hide Hint' : 'Show Formula Hint'}</span>
                  </button>
                  <span className="inline-flex items-center gap-1">
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Click card to flip</span>
                  </span>
                </div>
              </div>

              {/* Back */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-blue-200 dark:border-blue-900 bg-slate-50 dark:bg-slate-900 p-8 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Concept & Formula Answer
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {activeCard.chapter}
                  </span>
                </div>

                <div className="my-auto py-4 space-y-4 text-center">
                  <p className="font-mono text-sm sm:text-base font-semibold text-blue-800 dark:text-blue-300 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-3 rounded-xl inline-block">
                    {activeCard.formula}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-xl mx-auto">
                    {activeCard.back}
                  </p>
                </div>

                <div className="flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  <span>Rate your recall below to advance</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation & Spaced-Repetition Grading */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsFlipped(false);
                  setShowHint(false);
                  setCurrentIndex((prev) => (prev - 1 + deck.length) % deck.length);
                }}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFlipped(!isFlipped)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{isFlipped ? 'Show Prompt' : 'Reveal Answer'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFlipped(false);
                  setShowHint(false);
                  setCurrentIndex((prev) => (prev + 1) % deck.length);
                }}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRateCard('practice')}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 cursor-pointer whitespace-nowrap"
              >
                Needs Practice
              </button>
              <button
                type="button"
                onClick={() => handleRateCard('good')}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 cursor-pointer whitespace-nowrap"
              >
                Good
              </button>
              <button
                type="button"
                onClick={() => handleRateCard('mastered')}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mastered</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
