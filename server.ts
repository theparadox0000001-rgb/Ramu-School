import express from 'express';
import type { Request, Response } from 'express';
import http from 'node:http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeDatabase } from './server/db.ts';
import { apiRouter, getPlatformConfig } from './server/apiRouter.ts';
import { createRateLimiter } from './server/infra.ts';
import { attachClassroomWebSocketServer } from './server/realtimeBoard.ts';
import {
  generateAdaptiveStudyPlan,
  generateLectureSummary,
  generatePracticeQuestions,
  solveAcademicDoubt,
} from './server/aiService.ts';
import type { DifficultyLevel, ExamTrack, SubjectName } from './src/types/portal.ts';

dotenv.config();
initializeDatabase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use('/api', createRateLimiter(800));
app.use('/api', apiRouter);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    database: 'sqlite-wal',
    institution: getPlatformConfig().institutionName,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

interface AinaRequestBody {
  question?: string;
  subject?: string;
  track?: string;
  mode?: 'hint' | 'full';
  language?: 'English' | 'Hindi' | 'Hinglish';
  imageBase64?: string;
  imageMimeType?: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
}

app.post('/api/aina/solve', async (req: Request, res: Response) => {
  try {
    if (!getPlatformConfig().aiMentorEnabled) {
      res.status(403).json({
        error: 'AINA AI Mentor is currently paused by the Ramu School Administrator.',
      });
      return;
    }

    const body = req.body as AinaRequestBody;
    const question = (body.question || '').trim();
    const subject = body.subject || 'General Science';
    const track = body.track || 'IIT-JEE';
    const mode = body.mode === 'hint' ? 'hint' : 'full';
    const language =
      body.language === 'Hindi' || body.language === 'Hinglish' ? body.language : 'English';

    if (!question && !body.imageBase64) {
      res.status(400).json({ error: 'Please enter a question or attach an image.' });
      return;
    }

    const result = await solveAcademicDoubt({
      question,
      subject,
      track,
      mode,
      language,
      imageBase64: body.imageBase64,
      imageMimeType: body.imageMimeType,
      history: body.history,
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to reach AINA mentor right now.';
    console.error('AINA solve error:', err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/study-plan', async (req: Request, res: Response) => {
  try {
    if (!getPlatformConfig().aiMentorEnabled) {
      res.status(403).json({ error: 'AI Study Planner is currently disabled by Administrator.' });
      return;
    }
    const {
      studentName = 'Student',
      track = 'IIT-JEE',
      dailyGoalHours = 4,
      weakTopics = [],
      avgAccuracyPercent = 72,
    } = req.body as {
      studentName?: string;
      track?: ExamTrack;
      dailyGoalHours?: number;
      weakTopics?: string[];
      avgAccuracyPercent?: number;
    };

    const plan = await generateAdaptiveStudyPlan({
      studentName,
      track,
      dailyGoalHours: Math.max(1, Number(dailyGoalHours) || 4),
      weakTopics: Array.isArray(weakTopics) ? weakTopics : [],
      avgAccuracyPercent: Math.max(0, Math.min(100, Number(avgAccuracyPercent) || 72)),
    });
    res.json(plan);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to generate study plan.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/generate-practice', async (req: Request, res: Response) => {
  try {
    if (!getPlatformConfig().aiMentorEnabled) {
      res.status(403).json({ error: 'AI Practice Generator is disabled by Administrator.' });
      return;
    }
    const {
      subject = 'Physics',
      topic = 'Electrostatics & Capacitance',
      track = 'IIT-JEE',
      difficulty = 'Moderate',
      count = 3,
    } = req.body as {
      subject?: SubjectName;
      topic?: string;
      track?: ExamTrack;
      difficulty?: DifficultyLevel;
      count?: number;
    };

    const result = await generatePracticeQuestions({
      subject,
      topic: topic.trim() || 'Core Concepts',
      track,
      difficulty,
      count: Math.min(8, Math.max(1, Number(count) || 3)),
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to generate practice questions.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/lecture-summary', async (req: Request, res: Response) => {
  try {
    if (!getPlatformConfig().aiMentorEnabled) {
      res.status(403).json({ error: 'AI Lecture Summarizer is disabled by Administrator.' });
      return;
    }
    const {
      title = 'Concept Lecture',
      subject = 'Physics',
      notesContent = '',
    } = req.body as {
      title?: string;
      subject?: string;
      notesContent?: string;
    };

    const result = await generateLectureSummary({
      title,
      subject,
      notesContent,
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to summarize lecture notes.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  attachClassroomWebSocketServer(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Ramu School EdTech OS server + WebSocket running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
