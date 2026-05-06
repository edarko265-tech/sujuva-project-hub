/**
 * AI assistant abstraction.
 * - If OPENAI_API_KEY is set, calls the OpenAI Chat Completions API.
 * - Otherwise returns deterministic mock responses so the UI/flow works locally.
 *
 * The chatbot is permission-aware: callers must pass the authenticated user id/role
 * and the projects the user has access to.
 */
import type { Role } from './auth';

export interface ChatContext {
  userId: string;
  userName: string;
  role: Role;
  accessibleProjects: Array<{ id: string; name: string; completion: number; currentPhase: string }>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BrainDumpAIContext {
  accessibleProjects: Array<{ id: string; name: string; phases: Array<{ id: string; name: string }> }>;
}

export interface BrainDumpProposal {
  title: string;
  description: string;
  projectId?: string | null;
  phaseId?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  tags?: string[];
  effort?: 'S' | 'M' | 'L';
  source: 'openai' | 'heuristic';
}

export async function chat(messages: ChatMessage[], ctx: ChatContext): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const systemPrompt = buildSystemPrompt(ctx);
  const finalMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];

  if (!apiKey) {
    return mockReply(messages[messages.length - 1]?.content ?? '', ctx);
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        messages: finalMessages,
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      return `AI service error (${res.status}). Falling back to mock: ${mockReply(messages[messages.length - 1]?.content ?? '', ctx)}`;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '(empty AI response)';
  } catch (err) {
    return `AI request failed. Mock reply: ${mockReply(messages[messages.length - 1]?.content ?? '', ctx)}`;
  }
}

function buildSystemPrompt(ctx: ChatContext) {
  const projectList = ctx.accessibleProjects
    .map((p) => `- ${p.name} (${p.completion}% complete, current phase: ${p.currentPhase})`)
    .join('\n');
  return `You are the Project Hub assistant for ${ctx.userName} (role: ${ctx.role}).
Only discuss data the user is allowed to see. The user has access to these projects:
${projectList || '(none)'}.
When the user describes an idea, ask which project it belongs to and propose a clear feature/task title and description. Confirm before suggesting updates.`;
}

function mockReply(input: string, ctx: ChatContext): string {
  const trimmed = input.trim();
  if (!trimmed) return `Hi ${ctx.userName}! I am the Project Hub assistant (mock mode). Ask me about your projects or share an idea.`;
  if (/list|projects|what.*work/i.test(trimmed)) {
    if (ctx.accessibleProjects.length === 0) return 'You currently have no projects assigned.';
    return 'Your projects:\n' + ctx.accessibleProjects.map((p) => `• ${p.name} — ${p.completion}% (${p.currentPhase})`).join('\n');
  }
  if (/idea|brain.?dump|propose|new task|new feature/i.test(trimmed)) {
    return `Got it. I would propose a new feature titled "${summarise(trimmed)}". Which project should it go under?`;
  }
  return `Mock assistant: I heard "${summarise(trimmed)}". (Configure OPENAI_API_KEY for real responses.)`;
}

function summarise(text: string) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 12).join(' ');
  return words.length < text.length ? words + '…' : words;
}

/** Convert raw brain-dump text into a proposed feature draft (rule-based fallback). */
export function brainDumpToProposal(rawText: string): { title: string; description: string } {
  const trimmed = rawText.trim();
  const firstSentence = trimmed.split(/[.!?\n]/)[0] || trimmed;
  const title = firstSentence.length > 80 ? firstSentence.slice(0, 77) + '…' : firstSentence;
  return {
    title: title || 'New idea',
    description: trimmed,
  };
}

/**
 * Structured AI proposal for brain-dumps.
 * Falls back to `brainDumpToProposal()` when OPENAI is unavailable/fails.
 */
export async function proposeFromBrainDump(rawText: string, ctx: BrainDumpAIContext): Promise<BrainDumpProposal> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = brainDumpToProposal(rawText);
    return { ...fallback, source: 'heuristic' };
  }

  const projectsCompact = ctx.accessibleProjects.map((p) => ({
    id: p.id,
    name: p.name,
    phases: p.phases.map((ph) => ({ id: ph.id, name: ph.name })),
  }));

  const systemPrompt = [
    'You are an assistant turning rough user ideas into actionable project feature proposals.',
    'Only select projectId/phaseId from the provided allow-list.',
    'Keep title concise (<= 80 chars) and description practical (<= 1200 chars).',
    'Return JSON only with keys: title, description, projectId, phaseId, priority, tags, effort.',
    'priority must be one of LOW|MEDIUM|HIGH|CRITICAL; effort must be S|M|L; tags max 6 short strings.',
    `Allowed projects: ${JSON.stringify(projectsCompact)}`,
  ].join(' ');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText },
        ],
      }),
    });

    if (!res.ok) {
      const fallback = brainDumpToProposal(rawText);
      return { ...fallback, source: 'heuristic' };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof content === 'string' ? content : '{}') as Partial<BrainDumpProposal>;

    const fallback = brainDumpToProposal(rawText);
    const validPriorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    const validEfforts = new Set(['S', 'M', 'L']);
    const projectAllow = new Set(projectsCompact.map((p) => p.id));
    const phaseAllow = new Set(projectsCompact.flatMap((p) => p.phases.map((ph) => ph.id)));

    return {
      title: sanitizeTitle(parsed.title) ?? fallback.title,
      description: sanitizeDescription(parsed.description) ?? fallback.description,
      projectId: parsed.projectId && projectAllow.has(parsed.projectId) ? parsed.projectId : null,
      phaseId: parsed.phaseId && phaseAllow.has(parsed.phaseId) ? parsed.phaseId : null,
      priority: parsed.priority && validPriorities.has(parsed.priority) ? parsed.priority : undefined,
      effort: parsed.effort && validEfforts.has(parsed.effort) ? parsed.effort : undefined,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
        : undefined,
      source: 'openai',
    };
  } catch {
    const fallback = brainDumpToProposal(rawText);
    return { ...fallback, source: 'heuristic' };
  }
}

function sanitizeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  return v.length > 80 ? `${v.slice(0, 77)}…` : v;
}

function sanitizeDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  return v.length > 1500 ? `${v.slice(0, 1497)}…` : v;
}
