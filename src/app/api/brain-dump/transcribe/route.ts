import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
// Allow up to ~25 MB raw audio (Whisper limit is 25 MB)
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = /^audio\/(webm|ogg|mpeg|mp4|wav|x-m4a|m4a|mp3)/i;

/**
 * Transcribe an uploaded audio blob with OpenAI Whisper.
 *
 * Request: multipart/form-data with field `audio` (Blob/File).
 * Response: { text: string } on success, { error: string } on failure.
 *
 * Falls back with a clear 503 if OPENAI_API_KEY is missing.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Voice transcription requires OPENAI_API_KEY on the server.' },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('audio');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing "audio" field' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty audio' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio too large (max 25 MB)' }, { status: 413 });
  }
  if (file.type && !ALLOWED_MIME.test(file.type)) {
    return NextResponse.json({ error: `Unsupported audio type: ${file.type}` }, { status: 415 });
  }

  // Re-package for OpenAI (the SDK-less HTTP API expects FormData).
  const upstream = new FormData();
  const filename = (file as File).name || 'audio.webm';
  upstream.append('file', file, filename);
  upstream.append('model', process.env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1');
  upstream.append('response_format', 'json');

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || `Whisper error ${res.status}` },
        { status: 502 },
      );
    }
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'Empty transcription' }, { status: 502 });
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Transcription request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
