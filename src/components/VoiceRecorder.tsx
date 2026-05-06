'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Voice capture for brain-dumps.
 *
 * - Uses MediaRecorder + getUserMedia (browser API; HTTPS or localhost only).
 * - Records audio/webm (or browser default), POSTs to /api/brain-dump/transcribe
 *   which forwards to OpenAI Whisper and returns plain text.
 * - On success, calls onTranscript(text) so the parent can append to its textarea.
 */
export function VoiceRecorder({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setSupported(false);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = handleStop;
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
    }
  }

  function stop() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
  }

  async function handleStop() {
    setBusy(true);
    try {
      const blob = new Blob(chunksRef.current, {
        type: chunksRef.current[0]?.type || 'audio/webm',
      });
      if (blob.size === 0) {
        setError('No audio captured');
        return;
      }
      const fd = new FormData();
      const ext = blob.type.includes('mp4')
        ? 'm4a'
        : blob.type.includes('ogg')
          ? 'ogg'
          : 'webm';
      fd.append('audio', blob, `dump.${ext}`);
      const res = await fetch('/api/brain-dump/transcribe', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.text) {
        setError(data.error || `Transcription failed (${res.status})`);
        return;
      }
      onTranscript(String(data.text).trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      chunksRef.current = [];
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-slate-400">
        🎙️ Voice capture not supported in this browser.
      </p>
    );
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {!recording && !busy && (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="btn-ghost"
          title="Record voice note"
        >
          🎙️ Record voice
        </button>
      )}
      {recording && (
        <button
          type="button"
          onClick={stop}
          className="btn-gold inline-flex items-center gap-2"
          title="Stop and transcribe"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          Stop ({mm}:{ss})
        </button>
      )}
      {busy && <span className="text-xs text-slate-500">Transcribing…</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
