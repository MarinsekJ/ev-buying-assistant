import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.PROJECT_ROOT ?? path.resolve(serverDir, '../..');

const requestSchema = z.object({
  weeklyCommuteMiles: z.coerce.number().min(1).max(900),
  state: z.string().trim().min(2).max(2),
  utilityRate: z.coerce.number().min(0.05).max(0.8)
});

app.use(helmet());
app.use(cors({ origin: frontendOrigin === '*' ? true : frontendOrigin }));
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

function runPythonPrediction({ weeklyCommuteMiles, state, utilityRate }) {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON_BIN ?? 'python';
    const args = [
      '-m',
      'ev_transition.predict',
      '--weekly-commute-miles',
      String(weeklyCommuteMiles),
      '--state',
      state.toUpperCase(),
      '--utility-rate',
      String(utilityRate)
    ];

    const child = spawn(python, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: process.env.PYTHONPATH ?? path.join(projectRoot, 'src'),
        MODEL_DIR: process.env.MODEL_DIR ?? path.join(projectRoot, 'models')
      },
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || `Python exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Invalid prediction response: ${stdout}`));
      }
    });
  });
}

app.listen(port, () => {
  console.log(`EV transition API listening on ${port}`);
});
