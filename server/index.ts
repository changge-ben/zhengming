import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { EXPRESSION_STYLES } from '../shared/styles.ts';
import { generateTurn } from './debate.ts';
import { createProvider, getProvider, listProviders, loadProviders, providerHeaders, redact, updateProvider } from './providers.ts';
import { KeyStorageError } from './keyStorage.ts';
import { briefSchema, evidenceSchema, stageSchema } from '../shared/caseSchema.ts';

const app = express();
const port = Number(process.env.PORT || 8787);
app.disable('x-powered-by');
// Local-only service. Reject cross-origin writes (including DNS-rebinding hosts).
app.use((req, res, next) => {
  const host = req.hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return res.status(403).json({ error: '仅允许本机访问。' });
  const origin = req.get('origin');
  if (origin) {
    try {
      const u = new URL(origin);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return res.status(403).json({ error: '不允许跨站调用。' });
    } catch { return res.status(403).json({ error: '无效来源。' }); }
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.json({ limit: '8mb' }));
const speakerSchema = z.object({ side: z.enum(['pro', 'con']), member: z.number().int().min(0).max(2), providerId: z.string().max(100), modelId: z.string().min(1).max(200), name: z.string().max(80) });
const actorSchema = speakerSchema.extend({ side: z.enum(['pro', 'con', 'judge']) });
const configSchema = z.object({
  protocol: z.enum(['arena', 'structured']).optional(), brief: briefSchema.optional(), evidence: evidenceSchema.optional(),
  rulesVersion: z.number().int().optional(), styles: z.array(z.enum(EXPRESSION_STYLES.map(s => s.id))).min(1).max(6).optional(),
  pace: z.enum(['length', 'timed']).optional(), thinkingSeconds: z.number().int().min(60).max(600).optional(), speechChars: z.number().int().min(100).max(2000).optional(),
  topic: z.string().trim().min(5).max(500), teamSize: z.number().int().min(1).max(3), roundSeconds: z.number().int().min(30).max(600),
  matchSeconds: z.number().int().min(30).max(1800), prepSeconds: z.number().int().min(0).max(180), maxRounds: z.number().int().min(0).max(30), format: z.enum(['classic', 'crossfire', 'socratic']), language: z.enum(['natural', 'witty', 'rigorous']), demo: z.boolean(),
  teams: z.object({ pro: z.array(speakerSchema).min(1).max(3), con: z.array(speakerSchema).min(1).max(3) }),
  judge: z.object({ enabled: z.boolean(), providerId: z.string().max(100), modelId: z.string().max(200), appeals: z.boolean(), timing: z.enum(['final', 'coach']) }),
}).refine(c => c.teams.pro.length >= c.teamSize && c.teams.con.length >= c.teamSize, '辩手数量不足');
const sideScoreSchema = z.object({ judgeResponse: z.number().int().min(0).max(30).optional(), rigor: z.number().int().min(0).max(25), coherence: z.number().int().min(0).max(25), rebuttal: z.number().int().min(0).max(25), evidence: z.number().int().min(0).max(15), expression: z.number().int().min(0).max(10) });
const scoreSchema = z.object({ pro: sideScoreSchema, con: sideScoreSchema, tiebreak: z.string().max(1000).optional() });
const utteranceSchema = z.object({ stage: stageSchema.optional(), replyTo: z.string().max(100).optional(), id: z.string(), side: z.enum(['pro', 'con', 'audience', 'judge']), member: z.number(), name: z.string(), model: z.string(), round: z.number(), text: z.string().max(40000), timestamp: z.number(), elapsed: z.number().optional(), timeLimit: z.number().optional(), charLimit: z.number().optional(), warning: z.string().max(1000).optional(), conceded: z.boolean().optional(), forfeited: z.boolean().optional(), scores: scoreSchema.optional(), finishReason: z.string().optional(), kind: z.enum(['prep', 'speech', 'judge', 'appeal', 'review']).optional(), verdict: z.enum(['pro', 'con', 'draw', 'continue']).optional(), appealed: z.boolean().optional(), appealAttempt: z.union([z.literal(1), z.literal(2)]).optional() });
const turnSchema = z.object({ stage: stageSchema.optional(), replyTo: z.string().max(100).optional(), config: configSchema, speaker: actorSchema, round: z.number().int().min(1), timeLimit: z.number().min(.05).max(600), history: z.array(utteranceSchema), preparation: z.array(utteranceSchema).max(24).optional(), kind: z.enum(['prep', 'speech', 'judge', 'appeal', 'review']).optional(), isFinal: z.boolean().optional(), priorVerdict: z.enum(['pro', 'con', 'draw', 'continue']).optional(), overtimeRound: z.number().int().min(0).optional(), forceScoring: z.boolean().optional(), appealAttempt: z.union([z.literal(1), z.literal(2)]).optional() });
const providerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  baseUrl: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol) && !new URL(value).username && !new URL(value).password, '请输入不含用户名和密码的 HTTP(S) Base URL'),
  protocol: z.enum(['openai', 'anthropic']), tokenParameter: z.enum(['max_tokens', 'max_completion_tokens', 'none']),
  models: z.array(z.string().trim().min(1).max(200)).max(100), apiKey: z.string().max(2000).optional(), clearKey: z.boolean().optional(), rememberKey: z.boolean().optional(),
});
app.get('/api/health', (_req, res) => res.json({ ok: true, name: '争鸣' }));
app.get('/api/providers', (_req, res) => res.json({ providers: listProviders() }));
app.post('/api/providers', async (req, res) => {
  const parsed = providerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  try { const id = await createProvider(parsed.data); res.status(201).json({ id, providers: listProviders() }); }
  catch (error) { res.status(500).json({ error: error instanceof KeyStorageError ? error.message : '自定义入口未能保存，请检查配置目录。' }); }
});
app.put('/api/providers/:id', async (req, res) => {
  const parsed = providerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  if (!getProvider(req.params.id)) return res.status(404).json({ error: '服务商不存在。' });
  try { await updateProvider(req.params.id, parsed.data); res.json({ providers: listProviders() }); }
  catch (error) { res.status(500).json({ error: error instanceof KeyStorageError ? error.message : '配置未能保存，请检查 .local 目录写入权限。' }); }
});
app.post('/api/providers/:id/test', async (req, res) => {
  const p = getProvider(req.params.id);
  if (!p) return res.status(404).json({ error: '服务商不存在。' });
  try {
    const response = await fetch(`${p.baseUrl.replace(/\/+$/, '')}/models`, { headers: providerHeaders(p), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`接口返回 ${response.status}：${redact((await response.text()).slice(0, 300))}`);
    const data = await response.json() as { data?: { id?: string }[]; models?: { id?: string }[] };
    const models = (data.data || data.models || []).map(m => m.id).filter((id): id is string => typeof id === 'string');
    res.json({ ok: true, models, message: models.length ? `连接成功，发现 ${models.length} 个模型。` : '连接成功；接口未返回模型列表，请手动填写模型 ID。' });
  } catch (error) { res.status(502).json({ error: redact((error as Error).message) }); }
});
app.post('/api/turn', async (req, res) => {
  const input = turnSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: `辩论参数错误：${input.error.issues[0]?.message}` });
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const controller = new AbortController();
  const disconnect = () => controller.abort();
  res.on('close', disconnect);
  const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': ping\n\n'); }, 5000);
  try {
    for await (const event of generateTurn(input.data, controller.signal)) {
      if (controller.signal.aborted) break;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (error) {
    if (!controller.signal.aborted) res.write(`data: ${JSON.stringify({ type: 'error', message: redact((error as Error).message) })}\n\n`);
  } finally { clearInterval(heartbeat); res.off('close', disconnect); res.end(); }
});
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
if (existsSync(path.resolve('dist/index.html'))) {
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
}
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ error: error instanceof SyntaxError ? '请求 JSON 无效。' : '请求处理失败。' });
});
await loadProviders();
app.listen(port, '127.0.0.1', () => console.log(`争鸣 API 已启动：http://127.0.0.1:${port}`));
