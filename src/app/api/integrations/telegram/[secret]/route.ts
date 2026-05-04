import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTelegramMessage, type TelegramUpdate } from '@/lib/telegram';
import { brainDumpToProposal, chat } from '@/lib/ai';
import { getProjectWithProgress } from '@/lib/completion';
import type { Role } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Health check
export async function GET(_req: Request, { params }: { params: { secret: string } }) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || params.secret !== expected) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({ ok: true, message: 'Telegram webhook ready' });
}

export async function POST(req: Request, { params }: { params: { secret: string } }) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || params.secret !== expected) {
    // Always 200 to Telegram so it doesn't retry forever; but log nothing useful.
    return NextResponse.json({ ok: true });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message ?? update.edited_message;
  if (!msg || !msg.text || !msg.from) return NextResponse.json({ ok: true });

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const tgUsername = msg.from.username;
  const fromName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || tgUsername || String(msg.from.id);

  // Resolve hub user: match Telegram @username to local User.email's local-part (best-effort).
  // Admins can extend this with a real link table later.
  const user = tgUsername
    ? await prisma.user.findFirst({
        where: {
          active: true,
          OR: [
            { email: { startsWith: `${tgUsername}@` } },
            { name: tgUsername },
          ],
        },
      })
    : null;

  try {
    if (text === '/start' || text === '/help') {
      await sendTelegramMessage(
        chatId,
        `*Sujuva Project Hub*\nHi ${fromName}! Commands:\n` +
          '`/status` – list projects you can see\n' +
          '`/dump <idea>` – save a brain-dump\n' +
          'Anything else – chat with the AI assistant\n\n' +
          (user ? `Linked as *${user.name}* (${user.role}).` : `Not linked yet. Set your Telegram username to your hub email's local-part to auto-link.`),
      );
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/status')) {
      if (!user) {
        await sendTelegramMessage(chatId, 'You are not linked to a hub account yet.');
        return NextResponse.json({ ok: true });
      }
      const memberships = await prisma.projectMember.findMany({ where: { userId: user.id } });
      const managed = await prisma.project.findMany({ where: { managerId: user.id } });
      const ids = Array.from(new Set([...memberships.map((m) => m.projectId), ...managed.map((p) => p.id)]));
      if (ids.length === 0) {
        await sendTelegramMessage(chatId, 'You have no projects yet.');
        return NextResponse.json({ ok: true });
      }
      const lines = await Promise.all(
        ids.map(async (id) => {
          const p = await getProjectWithProgress(id);
          return p ? `• *${p.name}* — ${p.completion}% (${p.currentPhase})` : null;
        }),
      );
      await sendTelegramMessage(chatId, lines.filter(Boolean).join('\n'));
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/dump')) {
      if (!user) {
        await sendTelegramMessage(chatId, 'Link your Telegram username to a hub user before dumping ideas.');
        return NextResponse.json({ ok: true });
      }
      const raw = text.replace(/^\/dump\s*/i, '').trim();
      if (!raw) {
        await sendTelegramMessage(chatId, 'Usage: `/dump <your idea>`');
        return NextResponse.json({ ok: true });
      }
      const proposal = brainDumpToProposal(raw);
      await prisma.brainDump.create({
        data: {
          authorId: user.id,
          rawText: raw,
          proposedTitle: proposal.title,
          proposedDescription: proposal.description,
          status: 'PROPOSED',
        },
      });
      await sendTelegramMessage(chatId, `Saved brain-dump: *${proposal.title}*\nAn admin can promote it to a feature in the hub.`);
      return NextResponse.json({ ok: true });
    }

    // Free-form chat → AI
    const accessibleProjects: Array<{ id: string; name: string; completion: number; currentPhase: string }> = [];
    if (user) {
      const memberships = await prisma.projectMember.findMany({ where: { userId: user.id } });
      const managed = await prisma.project.findMany({ where: { managerId: user.id } });
      const ids = Array.from(new Set([...memberships.map((m) => m.projectId), ...managed.map((p) => p.id)]));
      for (const id of ids) {
        const p = await getProjectWithProgress(id);
        if (p) accessibleProjects.push({ id: p.id, name: p.name, completion: p.completion, currentPhase: p.currentPhase });
      }
    }
    const reply = await chat(
      [{ role: 'user', content: text }],
      {
        userId: user?.id ?? `tg:${msg.from.id}`,
        userName: user?.name ?? fromName,
        role: (user?.role as Role) ?? 'VIEWER',
        accessibleProjects,
      },
    );
    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    await sendTelegramMessage(chatId, 'Sorry, something went wrong handling that message.');
  }

  return NextResponse.json({ ok: true });
}
