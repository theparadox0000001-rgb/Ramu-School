import React, { useState } from 'react';
import { Bookmark, Calendar, Plus, Trash2 } from 'lucide-react';
import type {
  ChapterItem,
  FlashcardItem,
  NavSection,
  StudyTask,
  SubjectName,
} from '../types/portal';

interface PlannerBookmarksModuleProps {
  tasks: StudyTask[];
  chapters: ChapterItem[];
  flashcards: FlashcardItem[];
  onAddTask: (task: Omit<StudyTask, 'id'>) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onNavigate: (section: NavSection) => void;
  onOpenFlashcards: () => void;
}

export const PlannerBookmarksModule: React.FC<PlannerBookmarksModuleProps> = ({
  tasks,
  chapters,
  flashcards,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onNavigate,
  onOpenFlashcards,
}) => {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<SubjectName>('Physics');
  const [day, setDay] = useState<StudyTask['day']>('Wed');
  const [durationMin, setDurationMin] = useState(45);
  const [filterSubject, setFilterSubject] = useState<'All' | SubjectName>('All');

  const bookmarkedLessons = chapters.flatMap((ch) =>
    ch.lessons
      .filter((l) => l.bookmarked)
      .map((l) => ({ chapterTitle: ch.title, subject: ch.subject, lesson: l }))
  );
  const bookmarkedCards = flashcards.filter((f) => f.bookmarked);

  const visibleTasks = tasks.filter(
    (t) => filterSubject === 'All' || t.subject === filterSubject
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddTask({
      title: title.trim(),
      subject,
      day,
      durationMin,
      completed: false,
    });
    setTitle('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
          Study Planner & Saved Bookmarks
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Organize weekly revision blocks and revisit bookmarked lectures and formula cards.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Weekly Study Planner */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Weekly Revision Tasks
              </h2>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterSubject(s)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer ${
                    filterSubject === s
                      ? 'border-blue-700 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add study block (e.g., Rotational Dynamics PYQs)"
              className="sm:col-span-5 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectName)}
              className="sm:col-span-3 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option>Physics</option>
              <option>Chemistry</option>
              <option>Mathematics</option>
              <option>Biology</option>
              <option>English</option>
              <option>Vedic Mathematics</option>
              <option>Social Science</option>
            </select>
            <select
              value={day}
              onChange={(e) => setDay(e.target.value as StudyTask['day'])}
              className="sm:col-span-2 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <button
              type="submit"
              className="sm:col-span-2 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white inline-flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          {visibleTasks.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              No study tasks scheduled for this filter. Add a revision block above.
            </p>
          ) : (
            <div className="space-y-2.5">
              {visibleTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800"
                >
                  <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => onToggleTask(task.id)}
                      className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          task.completed
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {task.subject} · {task.day} · {task.durationMin} min
                      </p>
                    </div>
                  </label>
                  <button
                    type="button"
                    aria-label="Delete study task"
                    onClick={() => onDeleteTask(task.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: Centralized Bookmarks Hub */}
        <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              Bookmarked Lessons & Flashcards
            </h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Lectures & Notes ({bookmarkedLessons.length})</span>
                <button
                  type="button"
                  onClick={() => onNavigate('courses')}
                  className="text-blue-700 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                >
                  Open Courses
                </button>
              </div>
              {bookmarkedLessons.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Bookmark any lecture inside My Courses to pin it here.
                </p>
              ) : (
                bookmarkedLessons.map((item) => (
                  <div
                    key={item.lesson.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50"
                  >
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                      {item.subject} · {item.chapterTitle}
                    </p>
                    <p className="text-xs font-medium text-slate-900 dark:text-white mt-0.5">
                      {item.lesson.title}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Flashcards ({bookmarkedCards.length})</span>
                <button
                  type="button"
                  onClick={onOpenFlashcards}
                  className="text-blue-700 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                >
                  Review Deck
                </button>
              </div>
              {bookmarkedCards.map((card) => (
                <div
                  key={card.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50"
                >
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                    {card.subject} · {card.chapter}
                  </p>
                  <p className="text-xs text-slate-800 dark:text-slate-200 mt-0.5 line-clamp-2">
                    {card.front}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
