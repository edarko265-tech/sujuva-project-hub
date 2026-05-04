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
