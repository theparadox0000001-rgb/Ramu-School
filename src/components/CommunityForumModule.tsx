import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  MessageSquarePlus,
  Send,
  ThumbsUp,
  UserCheck,
} from 'lucide-react';
import type {
  CommunityPost,
  MentorshipSession,
  PortalRole,
  SubjectName,
} from '../types/portal';
import { portalApi } from '../services/api';

interface CommunityForumModuleProps {
  userRole: PortalRole;
}

const SUBJECTS: Array<'All' | SubjectName> = [
  'All',
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
];

const MENTOR_DIRECTORY = [
  { name: 'Prof. Priya Menon', role: 'Senior Physics HoD · IIT-JEE' },
  { name: 'Dr. Kavita Iyer', role: 'NEET Medical Lead · Biology & Organic' },
  { name: 'Prof. Vivek Kulkarni', role: 'Mathematics HoD · Calculus & Algebra' },
  { name: 'Ekansh Mishra', role: 'Academic Mentor · Physical Chemistry' },
];

export const CommunityForumModule: React.FC<CommunityForumModuleProps> = ({ userRole }) => {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [sessions, setSessions] = useState<MentorshipSession[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<'All' | SubjectName>('All');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');

  // New Post Form
  const [newSubject, setNewSubject] = useState<SubjectName>('Physics');
  const [newChapter, setNewChapter] = useState('Moving Charges & Magnetism');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');

  // Reply inputs keyed by postId
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // Mentorship booking
  const [mentorName, setMentorName] = useState(MENTOR_DIRECTORY[0].name);
  const [mentorTopic, setMentorTopic] = useState('');
  const [mentorSlot, setMentorSlot] = useState('Tomorrow · 6:00 PM IST');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, mRes] = await Promise.all([
        portalApi.getCommunityPosts(),
        portalApi.getMentorshipSessions(),
      ]);
      setPosts(cRes.posts);
      setSessions(mRes.sessions);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load community threads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredPosts = useMemo(() => {
    if (subjectFilter === 'All') return posts;
    return posts.filter((p) => p.subject === subjectFilter);
  }, [posts, subjectFilter]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newBody.trim()) return;
    setErrorMsg('');
    try {
      const res = await portalApi.createCommunityPost({
        subject: newSubject,
        chapterTitle: newChapter.trim() || 'Core Concept',
        title: newTitle.trim(),
        body: newBody.trim(),
      });
      setPosts((prev) => [res.post, ...prev]);
      setNewTitle('');
      setNewBody('');
      setNoticeMsg('Question published to subject doubt forum (+20 XP).');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not publish question.');
    }
  };

  const handleReply = async (postId: string) => {
    const body = (replyDrafts[postId] || '').trim();
    if (!body) return;
    try {
      const res = await portalApi.replyToCommunityPost(postId, body);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status: res.reply.isAccepted ? 'Resolved' : p.status,
                replies: [...p.replies, res.reply],
              }
            : p
        )
      );
      setReplyDrafts((prev) => ({ ...prev, [postId]: '' }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to post reply.');
    }
  };

  const handleUpvote = async (postId: string) => {
    try {
      const res = await portalApi.upvoteCommunityPost(postId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, upvotes: res.upvotes } : p)));
    } catch {
      // ignore
    }
  };

  const handleBookMentorship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mentorTopic.trim()) return;
    const mentor = MENTOR_DIRECTORY.find((m) => m.name === mentorName) || MENTOR_DIRECTORY[0];
    try {
      const res = await portalApi.bookMentorshipSession({
        mentorName: mentor.name,
        mentorRole: mentor.role,
        topic: mentorTopic.trim(),
        scheduledSlot: mentorSlot,
      });
      setSessions((prev) => [res.session, ...prev]);
      setMentorTopic('');
      setNoticeMsg(`1-on-1 Mentorship booked with ${mentor.name} (${mentorSlot}).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to book mentorship slot.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Academic Doubt Community & 1-on-1 Mentorship
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Peer-to-peer subject threads verified by Ramu School HoDs, plus 1-on-1 faculty strategy bookings.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUBJECTS.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSubjectFilter(sub)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                subjectFilter === sub
                  ? 'border-blue-700 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      {noticeMsg && (
        <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{noticeMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs font-medium text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Doubt Forum Feed & Post Box */}
        <div className="xl:col-span-8 space-y-5">
          <form
            onSubmit={handleCreatePost}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white font-display">
              <MessageSquarePlus className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>Ask the Academic Community</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value as SubjectName)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
                <option value="Mathematics">Mathematics</option>
                <option value="Biology">Biology</option>
                <option value="English">English</option>
              </select>
              <input
                type="text"
                value={newChapter}
                onChange={(e) => setNewChapter(e.target.value)}
                placeholder="Chapter name (e.g., Electrostatics)"
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Summarize your conceptual doubt in one sentence..."
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <textarea
              rows={2}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Share where you got stuck or the equation step you tried..."
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Publish Doubt</span>
              </button>
            </div>
          </form>

          {loading ? (
            <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
              Loading peer & faculty discussions...
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPosts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          {post.subject}
                        </span>{' '}
                        · {post.chapterTitle} · Posted by {post.authorName} · {post.createdAt}
                      </p>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1 font-display">
                        {post.title}
                      </h3>
                    </div>
                    <span
                      className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                        post.status === 'Resolved'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {post.status}
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {post.body}
                  </p>

                  <div className="flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => handleUpvote(post.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 tabular-nums cursor-pointer"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{post.upvotes} Upvotes</span>
                    </button>
                    <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                      {post.replies.length} Replies
                    </span>
                    {(userRole === 'teacher' || userRole === 'admin') && post.status !== 'Resolved' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await portalApi.updateCommunityPostStatus(post.id, 'Resolved');
                          setPosts((prev) =>
                            prev.map((x) => (x.id === post.id ? { ...x, status: 'Resolved' } : x))
                          );
                        }}
                        className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                      >
                        Mark Faculty Verified
                      </button>
                    )}
                  </div>

                  {post.replies.length > 0 && (
                    <div className="space-y-2 pt-2">
                      {post.replies.map((rep) => (
                        <div
                          key={rep.id}
                          className={`p-3 rounded-xl border text-xs space-y-1 ${
                            rep.isAccepted
                              ? 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                          }`}
                        >
                          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                              {rep.isAccepted && (
                                <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              )}
                              {rep.authorName} ({rep.authorRole})
                            </span>
                            <span>{rep.createdAt}</span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                            {rep.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={replyDrafts[post.id] || ''}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      placeholder="Write a helpful step-by-step reply..."
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() => handleReply(post.id)}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Reply
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Right: 1-on-1 Mentorship Scheduler */}
        <aside className="xl:col-span-4 space-y-5">
          <form
            onSubmit={handleBookMentorship}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white font-display">
              <CalendarCheck className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>Book 1-on-1 Faculty Mentorship</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Select Faculty Mentor
              </label>
              <select
                value={mentorName}
                onChange={(e) => setMentorName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                {MENTOR_DIRECTORY.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} · {m.role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Preferred Slot
              </label>
              <select
                value={mentorSlot}
                onChange={(e) => setMentorSlot(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option>Tomorrow · 6:00 PM IST</option>
                <option>Friday · 4:30 PM IST</option>
                <option>Saturday · 11:00 AM IST</option>
                <option>Sunday · 5:00 PM IST</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Mentorship Agenda / Weak Chapter
              </label>
              <input
                type="text"
                value={mentorTopic}
                onChange={(e) => setMentorTopic(e.target.value)}
                placeholder="e.g., Negative marking control in Rotational Motion"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
            >
              Confirm 1-on-1 Slot
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
              Scheduled & Past Check-ins ({sessions.length})
            </h3>
            <div className="space-y-3">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{s.mentorName}</span>
                    <span
                      className={`font-semibold ${
                        s.status === 'Completed'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-blue-700 dark:text-blue-400'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{s.topic}</p>
                  <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                    {s.scheduledSlot} · {s.studentName}
                  </p>
                  {s.actionNotes && (
                    <p className="text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200 dark:border-slate-800">
                      Action Plan: {s.actionNotes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
