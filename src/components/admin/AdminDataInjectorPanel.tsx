import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileCode2,
  FileSpreadsheet,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AdminInjectPayload,
  AdminInjectResult,
  DifficultyLevel,
  MockTestTemplate,
  SubjectName,
} from '../../types/portal';
import { portalApi } from '../../services/api';

interface AdminDataInjectorPanelProps {
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
  onRefreshParent: () => Promise<void> | void;
  onOpenTestsTab?: () => void;
}

type InjectorSubTab = 'daily_quiz' | 'csv' | 'json';

interface DraftMcqRow {
  localId: string;
  subject: SubjectName;
  chapterTitle: string;
  difficulty: DifficultyLevel;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  formulaUsed: string;
  explanation: string;
  avgTimeSec: number;
}

interface ParsedCsvQuestion {
  rowNum: number;
  subject: SubjectName;
  chapterTitle: string;
  difficulty: DifficultyLevel;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  formulaUsed: string;
  explanation: string;
  valid: boolean;
  issue?: string;
}

const SUBJECT_OPTIONS: SubjectName[] = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'English',
  'Vedic Mathematics',
  'Social Science',
];

const DIFFICULTY_OPTIONS: DifficultyLevel[] = ['Foundation', 'Moderate', 'Advanced'];

const CATEGORY_OPTIONS: MockTestTemplate['category'][] = [
  'Chapter Mastery',
  'All India Test Series',
  'Previous Year Paper',
  'CYOT Custom',
];

const CSV_TEMPLATE = [
  'subject,chapterTitle,difficulty,prompt,optionA,optionB,optionC,optionD,correctOption,formulaUsed,explanation',
  'Physics,"Laws of Motion",Moderate,"A 4 kg block accelerates at 2.5 m/s^2 on a smooth horizontal plane. Net horizontal force acting on it is:","5 N","10 N","12.5 N","20 N",B,"F = m * a","Applying Newton second law: F = 4 * 2.5 = 10 N."',
  'Chemistry,"Chemical Equilibrium",Moderate,"If Kc for N2 + 3H2 <=> 2NH3 is 16, what is Kc for 2NH3 <=> N2 + 3H2 at the same temperature?","16","4","1/16","1/4",C,"K_rev = 1 / K_fwd","Reversing a balanced equilibrium equation inverts the equilibrium constant."',
  'Mathematics,"Quadratic Equations",Foundation,"Sum of the roots of 2x^2 - 7x + 3 = 0 is:","7/2","-7/2","3/2","7",A,"alpha + beta = -b/a","For ax^2 + bx + c = 0, sum of roots = -(-7)/2 = 7/2."',
].join('\n');

function createBlankMcq(subject: SubjectName = 'Physics'): DraftMcqRow {
  return {
    localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    subject,
    chapterTitle: '',
    difficulty: 'Moderate',
    prompt: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    formulaUsed: '',
    explanation: '',
    avgTimeSec: 45,
  };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function coerceSubject(raw: string): SubjectName {
  const match = SUBJECT_OPTIONS.find((s) => s.toLowerCase() === raw.trim().toLowerCase());
  if (match) return match;
  const low = raw.trim().toLowerCase();
  if (low.includes('chem')) return 'Chemistry';
  if (low.includes('vedic')) return 'Vedic Mathematics';
  if (low.includes('math')) return 'Mathematics';
  if (low.includes('bio')) return 'Biology';
  if (low.includes('eng')) return 'English';
  if (low.includes('soc')) return 'Social Science';
  return 'Physics';
}

function coerceDifficulty(raw: string): DifficultyLevel {
  const low = raw.trim().toLowerCase();
  if (low.startsWith('found') || low === 'easy') return 'Foundation';
  if (low.startsWith('adv') || low === 'hard') return 'Advanced';
  return 'Moderate';
}

function coerceCorrectIndex(raw: string): number {
  const clean = raw.trim().toUpperCase();
  if (clean === 'A' || clean === '0' || clean === '1') return clean === '1' ? 0 : 0;
  if (clean === 'B' || clean === '2') return 1;
  if (clean === 'C' || clean === '3') return 2;
  if (clean === 'D' || clean === '4') return 3;
  const num = Number(clean);
  if (!Number.isNaN(num)) {
    if (num >= 0 && num <= 3) return Math.floor(num);
  }
  return 0;
}

export const AdminDataInjectorPanel: React.FC<AdminDataInjectorPanelProps> = ({
  onNotify,
  onError,
  onRefreshParent,
  onOpenTestsTab,
}) => {
  const [subTab, setSubTab] = useState<InjectorSubTab>('daily_quiz');
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<AdminInjectResult | null>(null);

  // ============================================================================
  // SUB-TAB 1: DAILY QUIZ & TEST BUNDLE BUILDER
  // ============================================================================
  const [quizTitle, setQuizTitle] = useState('');
  const [quizMode, setQuizMode] = useState<'dpp' | 'mock_test' | 'both'>('both');
  const [quizSubject, setQuizSubject] = useState<SubjectName>('Physics');
  const [quizCategory, setQuizCategory] =
    useState<MockTestTemplate['category']>('Chapter Mastery');
  const [quizDifficulty, setQuizDifficulty] = useState<DifficultyLevel>('Moderate');
  const [quizDuration, setQuizDuration] = useState(20);
  const [quizDateLabel, setQuizDateLabel] = useState('Today');
  const [quizNegativeMarking, setQuizNegativeMarking] = useState(true);
  const [draftMcqs, setDraftMcqs] = useState<DraftMcqRow[]>([createBlankMcq('Physics')]);

  // ============================================================================
  // SUB-TAB 2: CSV / SPREADSHEET IMPORTER
  // ============================================================================
  const [csvText, setCsvText] = useState('');
  const [csvTargetMode, setCsvTargetMode] = useState<'questions_only' | 'dpp' | 'mock_test' | 'both'>(
    'both'
  );
  const [csvQuizTitle, setCsvQuizTitle] = useState('Daily Practice Quiz · Imported Batch');
  const [csvSubject, setCsvSubject] = useState<SubjectName>('Physics');
  const [csvDuration, setCsvDuration] = useState(20);
  const csvFileRef = useRef<HTMLInputElement | null>(null);

  // ============================================================================
  // SUB-TAB 3: UNIVERSAL JSON / FILE IMPORTER
  // ============================================================================
  const [jsonText, setJsonText] = useState('');
  const jsonFileRef = useRef<HTMLInputElement | null>(null);

  const parsedCsvRows = useMemo<ParsedCsvQuestion[]>(() => {
    const trimmed = csvText.trim();
    if (!trimmed) return [];
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const firstCells = parseCsvLine(lines[0]).map((c) => c.toLowerCase());
    const hasHeader =
      firstCells.some((c) => c.includes('prompt') || c.includes('question')) &&
      firstCells.some((c) => c.includes('option'));

    const dataLines = hasHeader ? lines.slice(1) : lines;
    return dataLines.map((line, index) => {
      const cells = parseCsvLine(line);
      const [
        subjectRaw = 'Physics',
        chapterRaw = 'Imported Chapter',
        difficultyRaw = 'Moderate',
        promptRaw = '',
        optA = '',
        optB = '',
        optC = '',
        optD = '',
        correctRaw = 'A',
        formulaRaw = 'Core Concept',
        explanationRaw = 'Verified institutional answer.',
      ] = cells;

      const options: [string, string, string, string] = [optA, optB, optC, optD];
      const missingFields: string[] = [];
      if (!promptRaw.trim()) missingFields.push('prompt');
      if (options.some((o) => !o.trim())) missingFields.push('4 options');

      return {
        rowNum: hasHeader ? index + 2 : index + 1,
        subject: coerceSubject(subjectRaw),
        chapterTitle: chapterRaw.trim() || 'Imported Chapter',
        difficulty: coerceDifficulty(difficultyRaw),
        prompt: promptRaw.trim(),
        options,
        correctIndex: coerceCorrectIndex(correctRaw),
        formulaUsed: formulaRaw.trim() || 'Core Concept',
        explanation: explanationRaw.trim() || 'Verified institutional answer.',
        valid: missingFields.length === 0,
        issue: missingFields.length > 0 ? `Missing ${missingFields.join(' & ')}` : undefined,
      };
    });
  }, [csvText]);

  const jsonPreviewInfo = useMemo(() => {
    const raw = jsonText.trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AdminInjectPayload;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, error: 'Root value must be a JSON object.' };
      }
      const summaryParts: string[] = [];
      if (parsed.dailyQuiz) {
        summaryParts.push(
          `1 Daily Quiz (${parsed.dailyQuiz.questions?.length || 0} Qs · ${parsed.dailyQuiz.mode})`
        );
      }
      if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        summaryParts.push(`${parsed.questions.length} Questions`);
      }
      if (Array.isArray(parsed.dppSheets) && parsed.dppSheets.length > 0) {
        summaryParts.push(`${parsed.dppSheets.length} DPP Sheets`);
      }
      if (Array.isArray(parsed.mockTests) && parsed.mockTests.length > 0) {
        summaryParts.push(`${parsed.mockTests.length} Mock Tests`);
      }
      if (Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
        summaryParts.push(`${parsed.chapters.length} Chapters`);
      }
      if (Array.isArray(parsed.ncertSolutions) && parsed.ncertSolutions.length > 0) {
        summaryParts.push(`${parsed.ncertSolutions.length} NCERT Solutions`);
      }
      if (Array.isArray(parsed.flashcards) && parsed.flashcards.length > 0) {
        summaryParts.push(`${parsed.flashcards.length} Flashcards`);
      }
      if (Array.isArray(parsed.liveClasses) && parsed.liveClasses.length > 0) {
        summaryParts.push(`${parsed.liveClasses.length} Live Classes`);
      }
      if (Array.isArray(parsed.batches) && parsed.batches.length > 0) {
        summaryParts.push(`${parsed.batches.length} Batches`);
      }
      if (Array.isArray(parsed.users) && parsed.users.length > 0) {
        summaryParts.push(`${parsed.users.length} Users`);
      }
      return { valid: true, summaryParts };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Invalid JSON syntax.',
      };
    }
  }, [jsonText]);

  const executeInjection = async (payload: AdminInjectPayload, successLabel: string) => {
    setBusy(true);
    try {
      const res = await portalApi.injectAdminData(payload);
      setLastReceipt(res);
      await onRefreshParent();
      onNotify(`${successLabel} (${res.totalUpserted} SQLite records committed).`);
      return res;
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Data injection failed.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  // ============================================================================
  // DAILY QUIZ BUILDER HANDLERS
  // ============================================================================
  const updateMcqField = <K extends keyof DraftMcqRow>(
    localId: string,
    field: K,
    value: DraftMcqRow[K]
  ) => {
    setDraftMcqs((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, [field]: value } : row))
    );
  };

  const updateMcqOption = (localId: string, optIdx: number, value: string) => {
    setDraftMcqs((prev) =>
      prev.map((row) => {
        if (row.localId !== localId) return row;
        const nextOpts = [...row.options] as [string, string, string, string];
        nextOpts[optIdx] = value;
        return { ...row, options: nextOpts };
      })
    );
  };

  const handleLoadQuickSampleQuiz = () => {
    setQuizTitle('Daily Speed Booster · Kinematics & Electrochemistry');
    setQuizMode('both');
    setQuizSubject('Physics');
    setQuizCategory('Chapter Mastery');
    setQuizDifficulty('Moderate');
    setQuizDuration(15);
    setQuizDateLabel('Today');
    setQuizNegativeMarking(true);
    setDraftMcqs([
      {
        localId: `sample-1-${Date.now()}`,
        subject: 'Physics',
        chapterTitle: 'Kinematics in 1D',
        difficulty: 'Foundation',
        prompt:
          'A particle starts from rest with uniform acceleration 4 m/s^2. Distance covered in the 3rd second is:',
        options: ['8 m', '10 m', '12 m', '18 m'],
        correctIndex: 1,
        formulaUsed: 'S_n = u + a/2 (2n - 1)',
        explanation: 'S_3 = 0 + (4/2) * (2*3 - 1) = 2 * 5 = 10 m.',
        avgTimeSec: 40,
      },
      {
        localId: `sample-2-${Date.now()}`,
        subject: 'Chemistry',
        chapterTitle: 'Electrochemistry',
        difficulty: 'Moderate',
        prompt: 'The standard EMF of a Daniell cell (Zn | Zn2+ || Cu2+ | Cu) at 298 K is:',
        options: ['0.34 V', '0.76 V', '1.10 V', '1.52 V'],
        correctIndex: 2,
        formulaUsed: 'E°_cell = E°_cathode - E°_anode',
        explanation: 'E°_cell = +0.34 V - (-0.76 V) = 1.10 V.',
        avgTimeSec: 35,
      },
      {
        localId: `sample-3-${Date.now()}`,
        subject: 'Mathematics',
        chapterTitle: 'Definite Integration',
        difficulty: 'Moderate',
        prompt: 'What is the value of the definite integral of cos(x) from 0 to pi/2?',
        options: ['0', '1', '-1', 'pi/2'],
        correctIndex: 1,
        formulaUsed: 'int cos(x) dx = sin(x)',
        explanation: 'sin(pi/2) - sin(0) = 1 - 0 = 1.',
        avgTimeSec: 30,
      },
    ]);
  };

  const handleSubmitDailyQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizTitle.trim()) {
      onError('Please enter a Daily Quiz / Test title.');
      return;
    }
    const invalidRow = draftMcqs.find(
      (q) => !q.prompt.trim() || q.options.some((opt) => !opt.trim())
    );
    if (invalidRow) {
      onError('Every question needs a prompt and all 4 non-empty options (A, B, C, D).');
      return;
    }

    const res = await executeInjection(
      {
        dailyQuiz: {
          mode: quizMode,
          title: quizTitle.trim(),
          subject: quizSubject,
          category: quizCategory,
          difficulty: quizDifficulty,
          durationMin: quizDuration,
          dateLabel: quizDateLabel.trim() || 'Today',
          negativeMarking: quizNegativeMarking,
          questions: draftMcqs.map((q) => ({
            subject: q.subject,
            chapterTitle: q.chapterTitle.trim() || quizTitle.trim(),
            difficulty: q.difficulty,
            prompt: q.prompt.trim(),
            options: q.options.map((o) => o.trim()) as [string, string, string, string],
            correctIndex: q.correctIndex,
            formulaUsed: q.formulaUsed.trim() || 'Core Principle',
            explanation: q.explanation.trim() || 'Faculty verified solution.',
            avgTimeSec: q.avgTimeSec || 45,
          })),
        },
      },
      `Published "${quizTitle.trim()}"`
    );

    if (res?.ok) {
      setQuizTitle('');
      setDraftMcqs([createBlankMcq(quizSubject)]);
    }
  };

  // ============================================================================
  // CSV HANDLERS
  // ============================================================================
  const handleDownloadCsvTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'infinity-learn-quiz-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    const baseName = file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ');
    if (baseName) setCsvQuizTitle(baseName);
    e.target.value = '';
  };

  const handleInjectCsv = async () => {
    const validRows = parsedCsvRows.filter((r) => r.valid);
    if (validRows.length === 0) {
      onError('No valid CSV question rows found to inject.');
      return;
    }

    const mappedQuestions = validRows.map((r) => ({
      subject: r.subject,
      chapterTitle: r.chapterTitle,
      difficulty: r.difficulty,
      prompt: r.prompt,
      options: r.options,
      correctIndex: r.correctIndex,
      formulaUsed: r.formulaUsed,
      explanation: r.explanation,
      avgTimeSec: 45,
    }));

    const payload: AdminInjectPayload =
      csvTargetMode === 'questions_only'
        ? { questions: mappedQuestions }
        : {
            dailyQuiz: {
              mode: csvTargetMode,
              title: csvQuizTitle.trim() || 'Imported Daily Practice Quiz',
              subject: csvSubject,
              category: 'Chapter Mastery',
              difficulty: 'Moderate',
              durationMin: csvDuration,
              dateLabel: 'Today',
              negativeMarking: true,
              questions: mappedQuestions,
            },
          };

    const res = await executeInjection(
      payload,
      `Injected ${validRows.length} CSV question rows`
    );
    if (res?.ok) {
      setCsvText('');
    }
  };

  // ============================================================================
  // JSON HANDLERS
  // ============================================================================
  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setJsonText(text);
    e.target.value = '';
  };

  const handleExportCurrentDbJson = async () => {
    setBusy(true);
    try {
      const data = await portalApi.exportCurriculumJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'infinity-learn-sqlite-snapshot.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify('Exported live SQLite curriculum JSON snapshot.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const loadJsonPreset = (preset: 'quiz' | 'study_material' | 'operations') => {
    if (preset === 'quiz') {
      const sample: AdminInjectPayload = {
        dailyQuiz: {
          mode: 'both',
          title: 'Evening Sprint Quiz · Rotational Dynamics',
          subject: 'Physics',
          category: 'Chapter Mastery',
          difficulty: 'Moderate',
          durationMin: 15,
          dateLabel: 'Today',
          negativeMarking: true,
          questions: [
            {
              subject: 'Physics',
              chapterTitle: 'Rotational Motion',
              difficulty: 'Moderate',
              prompt: 'Moment of inertia of a uniform solid sphere of mass M and radius R about its diameter is:',
              options: ['(1/2)MR^2', '(2/5)MR^2', '(2/3)MR^2', 'MR^2'],
              correctIndex: 1,
              formulaUsed: 'I_sphere = (2/5)MR^2',
              explanation: 'For a solid sphere about any diameter, I = (2/5)MR^2.',
            },
            {
              subject: 'Physics',
              chapterTitle: 'Rotational Motion',
              difficulty: 'Foundation',
              prompt: 'SI unit of angular momentum is:',
              options: ['kg·m/s', 'kg·m^2/s', 'N·m', 'J/rad'],
              correctIndex: 1,
              formulaUsed: 'L = r × p = Iω',
              explanation: 'Dimensional unit is kg·m^2·s^-1.',
            },
          ],
        },
      };
      setJsonText(JSON.stringify(sample, null, 2));
    } else if (preset === 'study_material') {
      const sample: AdminInjectPayload = {
        chapters: [
          {
            subject: 'Chemistry',
            title: 'Coordination Compounds',
            unit: 'Unit 9 · Inorganic Chemistry',
            weightage: '9% JEE / NEET Weightage',
            lessons: [
              {
                id: `les-preset-${Date.now()}`,
                title: 'Crystal Field Theory & Spectrochemical Series',
                durationMin: 42,
                type: 'video',
                instructor: 'Dr. Ananya Rao',
                summary: 'High-spin vs low-spin octahedral and tetrahedral splitting with CFSE problems.',
                keyFormulas: ['CFSE = (-0.4 t2g + 0.6 eg) Δo'],
                timestamps: [{ time: '00:00', label: 'Ligand Splitting Overview' }],
                notesContent: 'Strong-field ligands (CN-, CO) cause pairing when Δo > P.',
                completed: false,
                bookmarked: false,
              },
            ],
          },
        ],
        flashcards: [
          {
            subject: 'Chemistry',
            chapter: 'Coordination Compounds',
            front: 'What is the coordination number of Fe in [Fe(C2O4)3]3-?',
            hint: 'Oxalate (C2O4^2-) is a bidentate ligand.',
            back: '6 (three bidentate oxalate ligands form six coordinate bonds).',
            formula: 'CN = Σ (denticity × count)',
          },
        ],
        ncertSolutions: [
          {
            subject: 'Chemistry',
            chapter: 'Coordination Compounds',
            exerciseRef: 'NCERT Ex 9.4',
            question: 'Explain why [Co(NH3)6]3+ is diamagnetic whereas [CoF6]3- is paramagnetic.',
            solutionSteps: [
              '1. In both ions, Co is in +3 oxidation state (3d6 configuration).',
              '2. NH3 is a strong-field ligand causing pairing (t2g6 eg0, 0 unpaired e-).',
              '3. F- is weak-field leaving 4 unpaired electrons (t2g4 eg2).',
            ],
            finalAnswer: '[Co(NH3)6]3+ is diamagnetic (0 unpaired e-) and [CoF6]3- is paramagnetic (4 unpaired e-).',
          },
        ],
      };
      setJsonText(JSON.stringify(sample, null, 2));
    } else {
      const sample: AdminInjectPayload = {
        batches: [
          {
            code: `SC-SPR-${Math.floor(10 + Math.random() * 89)}`,
            name: 'All India Evening Rankers Cohort',
            track: 'IIT-JEE',
            campus: 'Online National Live Cohort',
            leadFaculty: 'Ekansh Mishra',
            capacity: 80,
            studentCount: 1,
            scheduleSlot: 'Mon–Sat · 6:30 PM – 8:30 PM',
            status: 'Active',
          },
        ],
        liveClasses: [
          {
            title: 'Evening Doubt Clinic: Gauss Law & Flux',
            subject: 'Physics',
            instructor: 'Ekansh Mishra',
            status: 'upcoming',
            dateLabel: 'Today',
            timeRange: '6:30 pm – 7:30 pm',
            gradeLabel: 'Class 12',
            language: 'ENGLISH',
            track: 'IIT-JEE',
            chapter: 'Electrostatics',
            attendeesCount: 145,
          },
        ],
        users: [
          {
            name: 'Diya Kulkarni',
            email: `diya.${Math.floor(100 + Math.random() * 899)}@student.infinitylearn.com`,
            role: 'student',
            track: 'IIT-JEE',
            grade: 'Class 12',
          },
        ],
      };
      setJsonText(JSON.stringify(sample, null, 2));
    }
  };

  const handleInjectJson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonText.trim()) {
      onError('Paste a JSON payload or select a .json file first.');
      return;
    }
    try {
      const parsed = JSON.parse(jsonText) as AdminInjectPayload;
      const res = await executeInjection(parsed, 'Injected universal JSON bundle');
      if (res?.ok) {
        setJsonText('');
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Invalid JSON payload.');
    }
  };

  const receiptItems = useMemo(() => {
    if (!lastReceipt) return [];
    const c = lastReceipt.counts;
    const entries: Array<{ label: string; count: number }> = [
      { label: 'Questions', count: c.questions },
      { label: 'Daily Quizzes (DPPs)', count: c.dppSheets },
      { label: 'Timed Mock Tests', count: c.mockTests },
      { label: 'Chapters', count: c.chapters },
      { label: 'Lessons', count: c.lessons },
      { label: 'NCERT Solutions', count: c.ncertSolutions },
      { label: 'Flashcards', count: c.flashcards },
      { label: 'Live Classes', count: c.liveClasses },
      { label: 'Batches', count: c.batches },
      { label: 'Accounts', count: c.users },
    ];
    return entries.filter((e) => e.count > 0);
  }, [lastReceipt]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Data Injector & Daily Quiz Studio
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Inject live Daily Quizzes (DPPs), Timed Mock Tests, Question Banks, Study Material, Live Classes, or Accounts straight into SQLite.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleExportCurrentDbJson()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Live DB JSON</span>
        </button>
      </div>

      {/* Sub-tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'daily_quiz' as InjectorSubTab, label: 'Daily Quiz & Test Builder', icon: ClipboardCheck },
          { id: 'csv' as InjectorSubTab, label: 'CSV / Spreadsheet Importer', icon: FileSpreadsheet },
          { id: 'json' as InjectorSubTab, label: 'Universal JSON / File Importer', icon: FileCode2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-blue-700 text-white'
                  : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Commit Receipt Banner */}
      {lastReceipt && (
        <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Committed {lastReceipt.totalUpserted} SQLite Record{lastReceipt.totalUpserted === 1 ? '' : 's'} · Immediately Live in Student & Teacher Portals
              </span>
            </div>
            <p className="text-xs font-mono text-emerald-800 dark:text-emerald-300 tabular-nums">
              {receiptItems.map((i) => `+${i.count} ${i.label}`).join(' · ')}
              {lastReceipt.createdDppId ? ` · DPP ID: ${lastReceipt.createdDppId}` : ''}
              {lastReceipt.createdMockTestId ? ` · Mock Test ID: ${lastReceipt.createdMockTestId}` : ''}
            </p>
          </div>
          {onOpenTestsTab && (lastReceipt.counts.mockTests > 0 || lastReceipt.counts.dppSheets > 0) && (
            <button
              type="button"
              onClick={onOpenTestsTab}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              Inspect in Tests & Attempts
            </button>
          )}
        </section>
      )}

      {/* ====================================================================
          MODE 1: ONE-STEP DAILY QUIZ & TEST BUNDLE BUILDER
      ==================================================================== */}
      {subTab === 'daily_quiz' && (
        <form onSubmit={handleSubmitDailyQuiz} className="space-y-5">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                  1. Quiz / Test Bundle Metadata
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Questions created below are automatically added to the Question Bank AND published as your selected quiz format.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadQuickSampleQuiz}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Quick-Fill 3 Sample MCQs</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">Daily Quiz / Test Title</label>
                <input
                  type="text"
                  required
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  placeholder="e.g., Daily Practice Quiz #14 · Rotational Dynamics"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Publish Destination</label>
                <select
                  value={quizMode}
                  onChange={(e) => setQuizMode(e.target.value as 'dpp' | 'mock_test' | 'both')}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="both">Both Daily Quiz (DPP) + Timed Mock Test</option>
                  <option value="dpp">Daily Practice Quiz (DPP) Only</option>
                  <option value="mock_test">Timed Mock Test Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Primary Subject</label>
                <select
                  value={quizSubject}
                  onChange={(e) => setQuizSubject(e.target.value as SubjectName)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {SUBJECT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Test Category</label>
                <select
                  value={quizCategory}
                  onChange={(e) => setQuizCategory(e.target.value as MockTestTemplate['category'])}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Difficulty</label>
                <select
                  value={quizDifficulty}
                  onChange={(e) => setQuizDifficulty(e.target.value as DifficultyLevel)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={quizDuration}
                  onChange={(e) => setQuizDuration(Math.max(5, Number(e.target.value) || 20))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Schedule / Date Label</label>
                <input
                  type="text"
                  value={quizDateLabel}
                  onChange={(e) => setQuizDateLabel(e.target.value)}
                  placeholder="Today / 16 Nov"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={quizNegativeMarking}
                onChange={(e) => setQuizNegativeMarking(e.target.checked)}
              />
              <span>Enable NTA Marking Scheme (+4 correct / -1 incorrect)</span>
            </label>
          </section>

          {/* Question Cards */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                2. Questions in This Bundle ({draftMcqs.length})
              </h2>
              <button
                type="button"
                onClick={() => setDraftMcqs((prev) => [...prev, createBlankMcq(quizSubject)])}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question #{draftMcqs.length + 1}</span>
              </button>
            </div>

            {draftMcqs.map((q, idx) => (
              <article
                key={q.localId}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400">
                    QUESTION #{idx + 1} · {q.subject} · {q.difficulty}
                  </p>
                  {draftMcqs.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftMcqs((prev) => prev.filter((item) => item.localId !== q.localId))
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Question Subject</label>
                    <select
                      value={q.subject}
                      onChange={(e) =>
                        updateMcqField(q.localId, 'subject', e.target.value as SubjectName)
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {SUBJECT_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Chapter / Topic</label>
                    <input
                      type="text"
                      value={q.chapterTitle}
                      onChange={(e) => updateMcqField(q.localId, 'chapterTitle', e.target.value)}
                      placeholder={quizTitle || 'e.g., Rotational Dynamics'}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Difficulty</label>
                    <select
                      value={q.difficulty}
                      onChange={(e) =>
                        updateMcqField(q.localId, 'difficulty', e.target.value as DifficultyLevel)
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {DIFFICULTY_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Question Statement</label>
                  <textarea
                    rows={2}
                    required
                    value={q.prompt}
                    onChange={(e) => updateMcqField(q.localId, 'prompt', e.target.value)}
                    placeholder="Enter the exact MCQ question prompt..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['A', 'B', 'C', 'D'] as const).map((letter, optIdx) => {
                    const isCorrect = q.correctIndex === optIdx;
                    return (
                      <div
                        key={letter}
                        className={`p-2.5 rounded-xl border ${
                          isCorrect
                            ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <label className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
                            Option {letter}
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer">
                            <input
                              type="radio"
                              name={`correct-${q.localId}`}
                              checked={isCorrect}
                              onChange={() => updateMcqField(q.localId, 'correctIndex', optIdx)}
                            />
                            <span>Correct Answer</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          required
                          value={q.options[optIdx]}
                          onChange={(e) => updateMcqOption(q.localId, optIdx, e.target.value)}
                          placeholder={`Enter Option ${letter}...`}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Key Formula / Concept</label>
                    <input
                      type="text"
                      value={q.formulaUsed}
                      onChange={(e) => updateMcqField(q.localId, 'formulaUsed', e.target.value)}
                      placeholder="e.g., τ = Iα"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Step-by-Step Solution</label>
                    <input
                      type="text"
                      value={q.explanation}
                      onChange={(e) => updateMcqField(q.localId, 'explanation', e.target.value)}
                      placeholder="Short faculty solution explanation..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
              </article>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                Ready to commit {draftMcqs.length} MCQ{draftMcqs.length === 1 ? '' : 's'} ({draftMcqs.length * 4} max marks) · Mode: {quizMode}
              </p>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Upload className="w-4 h-4" />
                <span>{busy ? 'Injecting into SQLite...' : 'Inject Daily Quiz & Questions'}</span>
              </button>
            </div>
          </section>
        </form>
      )}

      {/* ====================================================================
          MODE 2: CSV / SPREADSHEET IMPORTER
      ==================================================================== */}
      {subTab === 'csv' && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                  Bulk CSV Question & Daily Quiz Importer
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Columns: <span className="font-mono">subject, chapterTitle, difficulty, prompt, optionA, optionB, optionC, optionD, correctOption (A-D), formulaUsed, explanation</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvText(CSV_TEMPLATE);
                    setCsvQuizTitle('Daily Mixed Quiz · Laws of Motion & Equilibrium');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Load Example CSV</span>
                </button>
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => csvFileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload .CSV File</span>
                </button>
              </div>
            </div>

            <textarea
              rows={7}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={CSV_TEMPLATE}
              className="w-full px-3 py-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-medium mb-1">Target Destination</label>
                <select
                  value={csvTargetMode}
                  onChange={(e) =>
                    setCsvTargetMode(
                      e.target.value as 'questions_only' | 'dpp' | 'mock_test' | 'both'
                    )
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="both">Questions + Daily Quiz (DPP) + Mock Test</option>
                  <option value="dpp">Questions + Daily Quiz (DPP)</option>
                  <option value="mock_test">Questions + Timed Mock Test</option>
                  <option value="questions_only">Add to Question Bank Only</option>
                </select>
              </div>

              {csvTargetMode !== 'questions_only' && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1">Quiz / Test Title</label>
                    <input
                      type="text"
                      value={csvQuizTitle}
                      onChange={(e) => setCsvQuizTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Quiz Subject</label>
                    <select
                      value={csvSubject}
                      onChange={(e) => setCsvSubject(e.target.value as SubjectName)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {SUBJECT_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Duration (minutes)</label>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={csvDuration}
                      onChange={(e) => setCsvDuration(Math.max(5, Number(e.target.value) || 20))}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          {parsedCsvRows.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                  Parsed Preview · {parsedCsvRows.filter((r) => r.valid).length} valid /{' '}
                  {parsedCsvRows.length} total rows
                </p>
                <button
                  type="button"
                  disabled={busy || parsedCsvRows.filter((r) => r.valid).length === 0}
                  onClick={() => void handleInjectCsv()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>
                    {busy
                      ? 'Injecting...'
                      : `Inject ${parsedCsvRows.filter((r) => r.valid).length} Valid Rows`}
                  </span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Row</th>
                      <th className="py-2.5 px-4 font-semibold">Subject · Chapter</th>
                      <th className="py-2.5 px-4 font-semibold">Prompt</th>
                      <th className="py-2.5 px-4 font-semibold">Correct</th>
                      <th className="py-2.5 px-4 font-semibold">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {parsedCsvRows.map((r) => (
                      <tr key={r.rowNum}>
                        <td className="py-2.5 px-4 font-mono tabular-nums">#{r.rowNum}</td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {r.subject}
                          </span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {r.chapterTitle} · {r.difficulty}
                          </p>
                        </td>
                        <td className="py-2.5 px-4 max-w-md truncate text-slate-700 dark:text-slate-300">
                          {r.prompt || '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold">
                          Option {(['A', 'B', 'C', 'D'] as const)[r.correctIndex]}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {r.valid ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              Ready
                            </span>
                          ) : (
                            <span className="text-rose-700 dark:text-rose-400 font-semibold">
                              {r.issue}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ====================================================================
          MODE 3: UNIVERSAL JSON / FILE IMPORTER
      ==================================================================== */}
      {subTab === 'json' && (
        <form onSubmit={handleInjectJson} className="space-y-4">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                  Universal JSON Bundle Importer
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Accepts any combination of <span className="font-mono">dailyQuiz, questions, dppSheets, mockTests, chapters, ncertSolutions, flashcards, liveClasses, batches, users</span>. Missing IDs are auto-generated.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadJsonPreset('quiz')}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Preset: Daily Quiz
                </button>
                <button
                  type="button"
                  onClick={() => loadJsonPreset('study_material')}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Preset: Chapters + NCERT
                </button>
                <button
                  type="button"
                  onClick={() => loadJsonPreset('operations')}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Preset: Classes + Users
                </button>
                <input
                  ref={jsonFileRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleJsonFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => jsonFileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload .JSON File</span>
                </button>
              </div>
            </div>

            <textarea
              rows={13}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='{ "dailyQuiz": { "mode": "both", "title": "...", "subject": "Physics", "questions": [...] }, "chapters": [...], "users": [...] }'
              className="w-full px-3 py-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />

            {jsonPreviewInfo && (
              <div
                className={`px-3.5 py-2.5 rounded-xl border text-xs ${
                  jsonPreviewInfo.valid
                    ? 'border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 text-blue-900 dark:text-blue-300'
                    : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300'
                }`}
              >
                {jsonPreviewInfo.valid ? (
                  <span className="font-mono">
                    Detected Payload:{' '}
                    {jsonPreviewInfo.summaryParts && jsonPreviewInfo.summaryParts.length > 0
                      ? jsonPreviewInfo.summaryParts.join(' · ')
                      : 'Empty object (add at least one supported key)'}
                  </span>
                ) : (
                  <span>JSON Parse Error: {jsonPreviewInfo.error}</span>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || !jsonPreviewInfo?.valid}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <Database className="w-4 h-4" />
                <span>{busy ? 'Injecting into SQLite...' : 'Inject JSON Bundle into SQLite'}</span>
              </button>
            </div>
          </section>
        </form>
      )}
    </div>
  );
};
