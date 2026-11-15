import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  DifficultyLevel,
  ExamTrack,
  SubjectName,
} from '../src/types/portal.ts';

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface SolveDoubtParams {
  question: string;
  subject: string;
  track: string;
  mode: 'hint' | 'full';
  language?: 'English' | 'Hindi' | 'Hinglish';
  imageBase64?: string;
  imageMimeType?: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
}

export async function solveAcademicDoubt(params: SolveDoubtParams): Promise<{
  answer: string;
  provider: 'gemini' | 'offline-engine';
}> {
  const ai = createGeminiClient();
  const lang = params.language || 'English';

  if (!ai) {
    const promptPreview = params.question || 'Attached diagram problem';
    const fallback =
      params.mode === 'hint'
        ? `Core Concept (${params.subject} · ${params.track}):\nIdentify the governing conservation principle or formula first before substituting values.\n\nStep 1 Hint for "${promptPreview}": Write down all known quantities in SI units, isolate the unknown variable, and check limiting cases.\n\nTip: Configure GEMINI_API_KEY in Settings > Secrets for live multimodal Gemini AI derivations.`
        : `Core Concept (${params.subject} · ${params.track}):\nApply standard NCERT & competitive exam principles for ${params.subject}.\n\nStep-by-Step Approach for "${promptPreview}":\n1. State the foundational law / definition and boundary conditions.\n2. Express the relationship symbolically and verify dimensional consistency.\n3. Substitute values cleanly and cross-check units.\n\nNote: Live Gemini AI reasoning activates automatically once GEMINI_API_KEY is attached in Settings > Secrets.`;
    return { answer: fallback, provider: 'offline-engine' };
  }

  const modeGuidance =
    params.mode === 'hint'
      ? 'Provide ONLY a Socratic conceptual hint and the first key equation or principle needed, without revealing the final numerical answer yet. Encourage the student to try the next step.'
      : 'Provide a clear, rigorous, step-by-step academic solution. Start with "Core Concept", then "Step-by-Step Derivation", and conclude with "Final Answer & Key Pitfall to Avoid".';

  const languageGuidance =
    lang === 'Hindi'
      ? 'Respond clearly in Hindi (Devanagari script) while keeping mathematical equations, units, and standard technical symbols readable.'
      : lang === 'Hinglish'
      ? 'Respond in crisp, student-friendly Hinglish (natural mix of Hindi and English academic terms) ideal for Indian JEE/NEET/Board students.'
      : 'Respond in clear, concise academic English.';

  const systemInstruction = `You are AINA, the academic tutor inside Ramu School.
You are helping a ${params.track} aspirant with a ${params.subject} question.
${modeGuidance}
${languageGuidance}
Use crisp mathematical notation (Unicode symbols like θ, Δ, ∫, √, ×, →, ≈, subscripts/superscripts) and numbered steps.`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (params.imageBase64 && params.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: params.imageMimeType,
        data: params.imageBase64,
      },
    });
  }

  const historyContext =
    Array.isArray(params.history) && params.history.length > 0
      ? params.history
          .slice(-4)
          .map((h) => `${h.role === 'user' ? 'Student' : 'AINA'}: ${h.text}`)
          .join('\n') + '\n\n'
      : '';

  parts.push({
    text: `${historyContext}Student Question (${params.subject} · ${params.track}): ${
      params.question || 'Please solve the problem shown in the attached image.'
    }`,
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const answer = response.text?.trim();
  if (!answer) {
    throw new Error('AINA returned an empty response. Please retry.');
  }
  return { answer, provider: 'gemini' };
}

export interface GeneratedPracticeQuestion {
  subject: SubjectName;
  chapterTitle: string;
  difficulty: DifficultyLevel;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  formulaUsed: string;
  explanation: string;
}

export async function generatePracticeQuestions(params: {
  subject: SubjectName;
  topic: string;
  track: ExamTrack;
  difficulty: DifficultyLevel;
  count: number;
}): Promise<{
  questions: GeneratedPracticeQuestion[];
  provider: 'gemini' | 'offline-engine';
}> {
  const safeCount = Math.min(8, Math.max(1, Number(params.count) || 3));
  const ai = createGeminiClient();

  if (!ai) {
    const items: GeneratedPracticeQuestion[] = Array.from({ length: safeCount }).map((_, idx) => ({
      subject: params.subject,
      chapterTitle: params.topic,
      difficulty: params.difficulty,
      prompt: `[${params.track} Practice #${idx + 1}] In ${params.topic} (${params.subject}), identify the governing physical/mathematical relation for condition case ${idx + 1}.`,
      options: [
        `Direct proportional relation (Case ${idx + 1}A)`,
        `Inverse square dependence (Case ${idx + 1}B)`,
        `Conserved invariant constant (Case ${idx + 1}C)`,
        `Exponential decay factor (Case ${idx + 1}D)`,
      ],
      correctIndex: idx % 4,
      formulaUsed: `${params.topic} Core Theorem`,
      explanation: `Generated for ${params.track} ${params.difficulty} level practice on ${params.topic}. Attach GEMINI_API_KEY in Settings > Secrets for live Gemini AI problem synthesis.`,
    }));
    return { questions: items, provider: 'offline-engine' };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Generate ${safeCount} original, exam-accurate multiple choice questions for ${params.track} on the topic "${params.topic}" under ${params.subject} at "${params.difficulty}" difficulty. Each question must have exactly 4 distinct options, a valid correctIndex (0-3), a concise key formula, and a clear explanation.`,
    config: {
      systemInstruction:
        'You are a senior IIT-JEE / NEET / CBSE exam setter at Ramu School. Output clean JSON strictly matching the schema.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING },
            optionA: { type: Type.STRING },
            optionB: { type: Type.STRING },
            optionC: { type: Type.STRING },
            optionD: { type: Type.STRING },
            correctIndex: { type: Type.INTEGER },
            formulaUsed: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
          required: [
            'prompt',
            'optionA',
            'optionB',
            'optionC',
            'optionD',
            'correctIndex',
            'formulaUsed',
            'explanation',
          ],
        },
      },
    },
  });

  const parsed = JSON.parse((response.text || '[]').trim()) as Array<{
    prompt: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctIndex: number;
    formulaUsed: string;
    explanation: string;
  }>;

  const questions: GeneratedPracticeQuestion[] = parsed.slice(0, safeCount).map((item) => ({
    subject: params.subject,
    chapterTitle: params.topic,
    difficulty: params.difficulty,
    prompt: item.prompt,
    options: [item.optionA, item.optionB, item.optionC, item.optionD],
    correctIndex: Math.min(3, Math.max(0, Number(item.correctIndex) || 0)),
    formulaUsed: item.formulaUsed || 'Core Concept',
    explanation: item.explanation || 'Step-by-step verified solution.',
  }));

  return { questions, provider: 'gemini' };
}

export interface GeneratedStudyPlan {
  focusDiagnosis: string;
  weeklyStrategy: string;
  tasks: Array<{
    title: string;
    subject: SubjectName;
    day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
    durationMin: number;
  }>;
  provider: 'gemini' | 'offline-engine';
}

export async function generateAdaptiveStudyPlan(params: {
  studentName: string;
  track: ExamTrack;
  dailyGoalHours: number;
  weakTopics: string[];
  avgAccuracyPercent: number;
}): Promise<GeneratedStudyPlan> {
  const ai = createGeminiClient();
  const weakSummary =
    params.weakTopics.length > 0 ? params.weakTopics.join(', ') : 'Electrostatics, Chemical Equilibrium, Definite Integration';

  if (!ai) {
    return {
      focusDiagnosis: `Current avg accuracy ${params.avgAccuracyPercent}% (${params.track}). Priority focus on: ${weakSummary}.`,
      weeklyStrategy: `Allocate ${params.dailyGoalHours} hrs/day using 60% active MCQ drills + error-log revision and 40% concept lectures.`,
      tasks: [
        { title: `Error-Log Sprint: ${params.weakTopics[0] || 'Physics Core'}`, subject: 'Physics', day: 'Mon', durationMin: 45 },
        { title: 'Organic & Equilibrium Mechanism Drill', subject: 'Chemistry', day: 'Tue', durationMin: 40 },
        { title: 'Timed 20-Q Calculus Speed Set', subject: 'Mathematics', day: 'Wed', durationMin: 50 },
        { title: 'NCERT Line-by-Line Revision & Flashcards', subject: 'Biology', day: 'Thu', durationMin: 35 },
        { title: 'Full-Length Mock Simulation Review', subject: 'Physics', day: 'Sat', durationMin: 60 },
      ],
      provider: 'offline-engine',
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Create a high-impact 5-task personalized weekly study plan for ${params.studentName} preparing for ${params.track}. Daily goal: ${params.dailyGoalHours} hours. Current average accuracy: ${params.avgAccuracyPercent}%. Weak topics identified: ${weakSummary}.`,
    config: {
      systemInstruction:
        'You are the Chief Academic Strategist at Ramu School. Return crisp JSON strictly matching the schema.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          focusDiagnosis: { type: Type.STRING },
          weeklyStrategy: { type: Type.STRING },
          tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                subject: { type: Type.STRING },
                day: { type: Type.STRING },
                durationMin: { type: Type.INTEGER },
              },
              required: ['title', 'subject', 'day', 'durationMin'],
            },
          },
        },
        required: ['focusDiagnosis', 'weeklyStrategy', 'tasks'],
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim()) as {
    focusDiagnosis: string;
    weeklyStrategy: string;
    tasks: Array<{ title: string; subject: string; day: string; durationMin: number }>;
  };

  const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  const validSubjects: SubjectName[] = [
    'Physics',
    'Chemistry',
    'Mathematics',
    'Biology',
    'English',
    'Vedic Mathematics',
    'Social Science',
  ];

  return {
    focusDiagnosis: parsed.focusDiagnosis || `Focus plan tailored for ${params.track}.`,
    weeklyStrategy: parsed.weeklyStrategy || `Target ${params.dailyGoalHours} hrs/day structured practice.`,
    tasks: (parsed.tasks || []).slice(0, 6).map((t, i) => ({
      title: t.title,
      subject: validSubjects.includes(t.subject as SubjectName)
        ? (t.subject as SubjectName)
        : 'Physics',
      day: validDays.includes(t.day as (typeof validDays)[number])
        ? (t.day as (typeof validDays)[number])
        : validDays[i % validDays.length],
      durationMin: Math.max(15, Math.min(180, Number(t.durationMin) || 40)),
    })),
    provider: 'gemini',
  };
}

export async function generateLectureSummary(params: {
  title: string;
  subject: string;
  notesContent: string;
}): Promise<{ summary: string; provider: 'gemini' | 'offline-engine' }> {
  const ai = createGeminiClient();
  if (!ai) {
    return {
      summary: `Revision Summary — ${params.title} (${params.subject}):\n• Master core definitions and boundary equations shown in class.\n• Work through 2–3 solved numerical examples before attempting the daily DPP.\n• Key Notes Extract: ${params.notesContent.slice(0, 220)}`,
      provider: 'offline-engine',
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Summarize this ${params.subject} lecture "${params.title}" into 4 high-yield bullet points and 1 quick self-check question based on these notes:\n\n${params.notesContent}`,
    config: {
      systemInstruction: 'You are an expert faculty assistant at Ramu School. Keep it concise, accurate, and exam-focused.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  return {
    summary: response.text?.trim() || 'Summary generated.',
    provider: 'gemini',
  };
}
