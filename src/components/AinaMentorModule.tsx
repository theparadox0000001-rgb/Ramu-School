import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Copy,
  ImagePlus,
  Loader2,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { ExamTrack, SavedDoubt, SubjectName } from '../types/portal';
import { getSessionToken } from '../services/api';

interface AinaMentorModuleProps {
  track: ExamTrack;
  savedDoubts: SavedDoubt[];
  prefillDoubt?: { subject: SubjectName; prompt: string } | null;
  onClearPrefill: () => void;
  onSaveDoubt: (doubt: SavedDoubt) => void;
  onDeleteDoubt: (id: string) => void;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  subject: SubjectName;
  mode: 'hint' | 'full';
  provider?: 'gemini' | 'offline-engine';
  imagePreview?: string;
}

const QUICK_PROMPTS: Array<{ subject: SubjectName; text: string }> = [
  {
    subject: 'Physics',
    text: 'Derive the electric field inside a spherical cavity carved inside a uniformly charged non-conducting sphere.',
  },
  {
    subject: 'Chemistry',
    text: 'Why does DMSO accelerate SN2 reactions compared to water or ethanol?',
  },
  {
    subject: 'Mathematics',
    text: 'Solve ∫[0 to π/2] sin²x / (sin x + cos x) dx using King Property.',
  },
  {
    subject: 'Biology',
    text: 'Explain negative and positive regulation in the E. coli lac operon for NEET.',
  },
];

export const AinaMentorModule: React.FC<AinaMentorModuleProps> = ({
  track,
  savedDoubts,
  prefillDoubt,
  onClearPrefill,
  onSaveDoubt,
  onDeleteDoubt,
}) => {
  const [subject, setSubject] = useState<SubjectName>('Physics');
  const [mode, setMode] = useState<'hint' | 'full'>('full');
  const [language, setLanguage] = useState<'English' | 'Hindi' | 'Hinglish'>('English');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<{
    dataUrl: string;
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);

  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      id: 'welcome-aina',
      role: 'model',
      subject: 'Physics',
      mode: 'full',
      text: `Hello! I am AINA, your 24/7 academic mentor for ${track}. Type any Physics, Chemistry, Mathematics, or Biology doubt—or upload a photo of a textbook problem—and choose either Step-by-Step Hint Mode or Full Solution Mode.`,
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!prefillDoubt) return;
    setSubject(prefillDoubt.subject);
    setInput(prefillDoubt.prompt);
    onClearPrefill();
  }, [prefillDoubt, onClearPrefill]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
      setAttachedImage({
        dataUrl,
        base64,
        mimeType: file.type || 'image/png',
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const sendQuestion = async (questionText?: string, overrideSubject?: SubjectName) => {
    const finalQuestion = (questionText ?? input).trim();
    const finalSubject = overrideSubject ?? subject;
    if (!finalQuestion && !attachedImage) return;

    setErrorMsg('');
    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      subject: finalSubject,
      mode,
      text: finalQuestion || 'Attached textbook diagram / problem image.',
      imagePreview: attachedImage?.dataUrl,
    };

    const currentImage = attachedImage;
    setMessages((prev) => [...prev, userTurn]);
    if (!questionText) setInput('');
    setAttachedImage(null);
    setLoading(true);

    try {
      const token = getSessionToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch('/api/aina/solve', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: finalQuestion,
          subject: finalSubject,
          track,
          mode,
          language,
          imageBase64: currentImage?.base64,
          imageMimeType: currentImage?.mimeType,
          history: messages.slice(-4).map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const data = (await response.json()) as {
        answer?: string;
        provider?: 'gemini' | 'offline-engine';
        error?: string;
      };
      if (!response.ok || !data.answer) {
        throw new Error(data.error || 'AINA could not process this request.');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          subject: finalSubject,
          mode,
          provider: data.provider,
          text: data.answer!,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error while contacting AINA.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            AINA Academic Mentor · 24/7 Doubt Resolution
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Ask conceptual questions or upload problem diagrams for guided hints or worked proofs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
            {(['English', 'Hindi', 'Hinglish'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  language === lang
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
            <button
              type="button"
              onClick={() => setMode('hint')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'hint'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Hint Mode
            </button>
            <button
              type="button"
              onClick={() => setMode('full')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'full'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Full Derivation
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Doubt Thread */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col min-h-[540px] max-h-[680px]">
          {/* Subject Bar */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                'Physics',
                'Chemistry',
                'Mathematics',
                'Biology',
                'English',
                'Vedic Mathematics',
                'Social Science',
              ] as SubjectName[]).map((subj) => (
                <button
                  key={subj}
                  type="button"
                  onClick={() => setSubject(subj)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    subject === subj
                      ? 'border-blue-700 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:border-blue-500 dark:text-blue-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {subj}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Track: {track}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const previousUserMsg = idx > 0 ? messages[idx - 1] : null;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-blue-700 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {msg.imagePreview && (
                      <img
                        src={msg.imagePreview}
                        alt="Uploaded problem diagram"
                        className="max-h-48 rounded-lg mb-2.5 border border-white/20"
                      />
                    )}
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  </div>

                  {!isUser && idx > 0 && (
                    <div className="mt-1.5 flex items-center gap-3 px-1">
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onSaveDoubt({
                            id: `doubt-${Date.now()}`,
                            subject: msg.subject,
                            question: previousUserMsg?.text || 'Saved AINA explanation',
                            answer: msg.text,
                            mode: msg.mode,
                            createdAt: 'Just now',
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>Save to My Doubts</span>
                      </button>

                      {msg.provider && (
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {msg.provider === 'gemini' ? 'Gemini AI' : 'Offline Engine'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 px-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                <span>AINA is deriving the solution...</span>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300"
              >
                {errorMsg}
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Quick Starters */}
          <div className="px-5 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.text}
                type="button"
                onClick={() => {
                  setSubject(qp.subject);
                  sendQuestion(qp.text, qp.subject);
                }}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {qp.subject}: {qp.text.slice(0, 38)}...
              </button>
            ))}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion();
            }}
            className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5"
          >
            {attachedImage && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                <span className="truncate font-medium">Attached: {attachedImage.name}</span>
                <button
                  type="button"
                  aria-label="Remove attached image"
                  onClick={() => setAttachedImage(null)}
                  className="p-1 hover:text-red-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                type="button"
                aria-label="Upload problem image"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer shrink-0"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask AINA a ${subject} question...`}
                className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={loading || (!input.trim() && !attachedImage)}
                className="px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Solve</span>
              </button>
            </div>
          </form>
        </div>

        {/* Saved Doubts History Panel */}
        <aside className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4 max-h-[680px]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
              Saved Doubts ({savedDoubts.length})
            </h2>
          </div>

          {savedDoubts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <Bookmark className="w-6 h-6 text-slate-400" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                No saved doubts yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click &ldquo;Save to My Doubts&rdquo; below any AINA derivation to archive it for pre-exam revision.
              </p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-1">
              {savedDoubts.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {item.subject} · {item.createdAt}
                    </span>
                    <button
                      type="button"
                      aria-label="Delete saved doubt"
                      onClick={() => onDeleteDoubt(item.id)}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2">
                    {item.question}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
