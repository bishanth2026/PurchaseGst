import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';

const TOKEN_ENDPOINT = 'https://obdkzsxdbaoudzudzazi.supabase.co/functions/v1/biznexco-live-token';
const LIVE_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

interface VoiceContext {
  organization: { name: string; gstin: string; currentReturnPeriod: string };
  invoiceCount: number;
  gstr2bCount: number;
  reconciliationSummary: {
    total: number;
    matched: number;
    probable: number;
    mismatches: number;
    missingIn2B: number;
    missingInBooks: number;
  };
  invoiceSamples: Array<{
    invoiceNumber: string;
    supplierName: string;
    totalAmount: number;
    itcEligibility?: string;
    status?: string;
  }>;
}

interface GeminiLiveVoiceProps {
  language: 'en-IN' | 'ml-IN';
  context: VoiceContext;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function floatToPcm16(input: Float32Array, targetSampleRate = 16000, sourceSampleRate = 48000): Uint8Array {
  const ratio = sourceSampleRate / targetSampleRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const sourceIndex = Math.min(input.length - 1, Math.floor(i * ratio));
    const sample = Math.max(-1, Math.min(1, input[sourceIndex]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return new Uint8Array(pcm.buffer);
}

export const GeminiLiveVoice: React.FC<GeminiLiveVoiceProps> = ({ language, context }) => {
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<'en-IN' | 'ml-IN'>('en-IN');

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopVoice();
    };
  }, []);

  const stopPlayback = () => {
    nextPlayTimeRef.current = 0;
  };

  const playPcm24k = (bytes: Uint8Array) => {
    const audioContext = audioContextRef.current;
    if (!audioContext || bytes.byteLength < 2) return;

    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const buffer = audioContext.createBuffer(1, pcm.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(audioContext.currentTime + 0.02, nextPlayTimeRef.current || 0);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  };

  const cleanup = () => {
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    try { streamRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
    try { wsRef.current?.close(); } catch {}
    try { audioContextRef.current?.close(); } catch {}
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    wsRef.current = null;
    audioContextRef.current = null;
    nextPlayTimeRef.current = 0;
  };

  const stopVoice = () => {
    cleanup();
    if (mountedRef.current) {
      setActive(false);
      setConnecting(false);
    }
  };

  const startVoice = async () => {
    if (active || connecting) return;
    setError('');
    setInputTranscript('');
    setOutputTranscript('');
    setConnecting(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not provide microphone access.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;

      const tokenResponse = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: selectedLanguage }),
      });
      const tokenPayload = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokenPayload?.token) {
        throw new Error(tokenPayload?.error || 'Could not obtain a secure Gemini Live session token.');
      }

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();

      const websocket = new WebSocket(`${LIVE_WS}?access_token=${encodeURIComponent(tokenPayload.token)}`);
      wsRef.current = websocket;

      websocket.onopen = () => {
        const systemInstruction = [
          'You are the Biznexco real-time voice assistant.',
          'Answer questions about GST, accounting, finance, business, and the Biznexco Purchase Invoice Automation application.',
          `Speak naturally in the user's selected language: ${selectedLanguage === 'ml-IN' ? 'Malayalam' : 'English (India)'}.`,
          'Use only the supplied current-app context for claims about live invoice counts, amounts, suppliers, reconciliation results, ITC, dates, and statuses.',
          'Never invent app data. If the supplied context does not contain the answer, say that it is not available.',
          'You are read-only in this voice phase. Do not claim that you approved, deleted, changed, uploaded, or reconciled anything.',
          'For tax/legal matters, provide informational guidance and recommend professional verification where appropriate.',
          'Keep spoken answers concise and practical.',
          'Current Biznexco context:',
          JSON.stringify(context),
        ].join('\n');

        websocket.send(JSON.stringify({
          setup: {
            model: 'models/gemini-3.8-live',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Kore',
                  },
                },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: { parts: [{ text: systemInstruction }] },
          },
        }));
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const content = message?.serverContent;

          if (content?.interrupted) {
            stopPlayback();
          }

          if (content?.inputTranscription?.text) {
            setInputTranscript((prev) => prev + content.inputTranscription.text);
          }
          if (content?.outputTranscription?.text) {
            setOutputTranscript((prev) => prev + content.outputTranscription.text);
          }

          const parts = content?.modelTurn?.parts || [];
          for (const part of parts) {
            if (part?.inlineData?.data) {
              playPcm24k(base64ToBytes(part.inlineData.data));
            }
          }
        } catch {
          // Ignore malformed streaming frames.
        }
      };

      websocket.onerror = () => {
        if (mountedRef.current) setError('Gemini Live connection failed. Please try again.');
      };

      websocket.onclose = (event) => {
        if (mountedRef.current && active) {
          setError(event.reason || 'Voice session ended.');
          setActive(false);
          setConnecting(false);
        }
      };

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      sourceRef.current = source;
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        const pcm = floatToPcm16(input, 16000, audioContext.sampleRate);
        socket.send(JSON.stringify({
          realtimeInput: {
            audio: {
              data: bytesToBase64(pcm),
              mimeType: 'audio/pcm;rate=16000',
            },
          },
        }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setActive(true);
      setConnecting(false);
    } catch (e: any) {
      cleanup();
      if (mountedRef.current) {
        setConnecting(false);
        setActive(false);
        const message = String(e?.message || 'Unable to start voice assistant.');
        setError(message.includes('Permission') || message.includes('permission')
          ? 'Microphone permission was denied. Allow microphone access for this site and try again.'
          : message);
      }
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={active ? stopVoice : startVoice}
          disabled={connecting}
          className={active
            ? 'inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold'
            : 'inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50'}
        >
          {active ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {connecting ? 'Connecting…' : active ? 'Stop Voice' : 'Start Live Voice'}
        </button>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value as 'en-IN' | 'ml-IN')}
          disabled={active || connecting}
          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-300"
          aria-label="Voice language"
        >
          <option value="en-IN">English (India)</option>
          <option value="ml-IN">Malayalam</option>
        </select>
        <div className="inline-flex items-center gap-2 text-xs text-slate-400">
          <Volume2 className="w-4 h-4 text-indigo-300" />
          Gemini Live • {language === 'ml-IN' ? 'Malayalam' : 'English'}
        </div>
      </div>

      {(inputTranscript || outputTranscript) && (
        <div className="mt-3 space-y-2 text-xs">
          {inputTranscript && (
            <div className="rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2 text-slate-400">
              <span className="text-slate-500">You: </span>{inputTranscript}
            </div>
          )}
          {outputTranscript && (
            <div className="rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2 text-slate-300">
              <span className="text-indigo-300">Biznexco: </span>{outputTranscript}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <p className="mt-2 text-[10px] text-slate-500">
        Voice uses a short-lived Gemini session token; your Gemini API key is not placed in the browser.
      </p>
    </div>
  );
};
