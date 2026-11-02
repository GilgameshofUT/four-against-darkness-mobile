// Art generation pipeline: Vertex AI (Gemini image model) -> art-src/*.png -> public/art/*.webp
// Usage: node scripts/art/generate.mjs [--only portraits,monsters] [--filter substring] [--concurrency 4] [--force]
// Auth: Application Default Credentials (gcloud auth application-default login).
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { buildJobs } from './manifest.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SRC_DIR = path.join(ROOT, 'art-src');
const OUT_DIR = path.join(ROOT, 'public/art');
const PROJECT = process.env.GCP_PROJECT || 'generative-ai-project-470317';
const MODEL = process.env.ART_MODEL || 'gemini-nano-banana-2.1';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const force = args.includes('--force');
const only = opt('only', '')?.split(',').filter(Boolean);
const filter = opt('filter', '');
const concurrency = Number(opt('concurrency', '4'));

const ai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: 'global' });

async function generate(job) {
  const srcPath = path.join(SRC_DIR, job.category, `${job.id}.png`);
  const outPath = path.join(OUT_DIR, job.category, `${job.id}.webp`);
  if (!force && fs.existsSync(outPath)) return 'skip';
  fs.mkdirSync(path.dirname(srcPath), { recursive: true });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (force || !fs.existsSync(srcPath)) {
    let lastErr;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: MODEL,
          contents: job.prompt,
          config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: job.aspect } },
        });
        const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        if (!part) throw new Error('no image in response: ' + JSON.stringify(res.candidates?.[0]?.finishReason));
        fs.writeFileSync(srcPath, Buffer.from(part.inlineData.data, 'base64'));
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 4000 * attempt));
      }
    }
    if (lastErr) throw lastErr;
  }

  let img = sharp(srcPath).resize(job.size[0], job.size[1], { fit: 'cover' });
  await img.webp({ quality: job.quality ?? 82 }).toFile(outPath);
  return 'ok';
}

const jobs = buildJobs().filter(
  (j) => (!only?.length || only.includes(j.category)) && (!filter || j.id.includes(filter)),
);
console.log(`${jobs.length} jobs, concurrency ${concurrency}, model ${MODEL}`);
let i = 0;
let done = 0;
const failures = [];
async function worker() {
  while (i < jobs.length) {
    const job = jobs[i++];
    try {
      const r = await generate(job);
      done++;
      if (r !== 'skip') console.log(`[${done}/${jobs.length}] ${job.category}/${job.id}`);
    } catch (e) {
      done++;
      failures.push(job.id);
      console.error(`FAIL ${job.category}/${job.id}: ${String(e).slice(0, 200)}`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

// Write an index of available art for the app
const index = {};
for (const cat of fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR) : []) {
  const dir = path.join(OUT_DIR, cat);
  if (!fs.statSync(dir).isDirectory()) continue;
  index[cat] = fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => f.replace('.webp', '')).sort();
}
fs.writeFileSync(path.join(ROOT, 'src/art-index.json'), JSON.stringify(index, null, 1));
console.log(`done. failures: ${failures.length ? failures.join(', ') : 'none'}`);
