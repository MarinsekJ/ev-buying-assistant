import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const frontendOrigins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.PROJECT_ROOT ?? path.resolve(serverDir, '../..');
const predictionTimeoutMs = Number(process.env.PREDICTION_TIMEOUT_MS ?? 30000);
let worker = null;
let nextRequestId = 1;
const pending = new Map();

const requestSchema = z.object({
  Weekly_Commute_Miles: z.coerce.number().min(1).max(900),
  State: z.string().trim().min(2).max(2),
  Utility_Rate_per_kWh: z.coerce.number().min(0.05).max(0.8)
}).passthrough();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || frontendOrigins.includes('*') || frontendOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  }
}));
app.use(express.json({ limit: '16kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ev-transition-api' });
});

app.post('/api/predict', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  try {
    const prediction = await runPythonPrediction(parsed.data);
    res.json(prediction);
  } catch (error) {
    res.status(503).json({
      error: 'Prediction service unavailable',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

function startWorker() {
  if (worker && !worker.killed) return worker;
  const python = process.env.PYTHON_BIN ?? 'python';
  const child = spawn(python, ['-m', 'ev_transition.predict_worker'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PYTHONPATH: process.env.PYTHONPATH ?? path.join(projectRoot, 'src'),
      MODEL_DIR: process.env.MODEL_DIR ?? path.join(projectRoot, 'models')
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  const stderr = [];
  child.stderr.on('data', chunk => {
    stderr.push(chunk.toString());
    if (stderr.length > 20) stderr.shift();
  });

  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', line => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.ok) {
      entry.resolve(message.prediction);
    } else {
      entry.reject(new Error(message.error || 'Prediction worker failed'));
    }
  });

  child.on('exit', code => {
    const message = `Prediction worker exited with code ${code}. ${stderr.join('').slice(-1000)}`;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    pending.clear();
    worker = null;
  });

  child.on('error', error => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
    worker = null;
  });

  worker = child;
  return child;
}

function runPythonPrediction(rawFeatures) {
  return new Promise((resolve, reject) => {
    const child = startWorker();
    const id = nextRequestId;
    nextRequestId += 1;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Prediction timed out after ${predictionTimeoutMs}ms`));
    }, predictionTimeoutMs);
    pending.set(id, { resolve, reject, timer });
    const payload = { id, ...rawFeatures };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  });
}

app.listen(port, () => {
  console.log(`EV transition API listening on ${port}`);
});
