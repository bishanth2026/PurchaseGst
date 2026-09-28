import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Mic, MicOff, Volume2 } from 'lucide-react';

const TOKEN_ENDPOINT = 'https://obdkzsxdbaoudzudzazi.supabase.co/functions/v1/biznexco-live-token';

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

function floatToPcm16(
  input: Float32Array,
  targetSampleRate = 16000,
  sourceSampleRate = 48000,
): Uint8Array {
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
  const [status, setStatus] = useState('Ready');

  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mountedRef = useRef(true);
  const stopTimerRef = useRef<number | null>(null);

  const disposeLocalAudio = () => {
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    try { streamRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
    try { audioContextRef.current?.close(); } catch {}

    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
  };

  const closeSession = () => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    try { sessionRef.current?.close?.(); } catch {}
    sessionRef.current = null;
    disposeLocalAudio();

    if (mountedRef.current) {
      setActive(false);
      setConnecting(false);
      setStatus('Ready');
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      closeSession();
    };
  }, []);

  const startVoice = async () => {
    if (active || connecting) return;

    setError('');
    setInputTranscript('');
    setOutputTranscript('');
    setConnecting(true);
    setStatus('Requesting microphone…');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not provide microphone access.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      setStatus('Getting secure Gemini session…');

      const tokenResponse = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: selectedLanguage }),
      });

      const tokenPayload = await tokenResponse.json().catch(() => ({}));

      if (!tokenResponse.ok || !tokenPayload?.token) {
        throw new Error(tokenPayload?.error || 'Could not obtain a secure Gemini Live session token.');
      }

      // Use Google's official GenAI SDK for the Live session instead of
      // manually parsing raw WebSocket frames. The SDK normalizes browser
      // WebSocket frames and exposes parsed serverContent callbacks.
      const ai = new GoogleGenAI({ apiKey: tokenPayload.token });

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

      setStatus('Connecting to Gemini Live…');

      const session = await ai.live.connect({
        model: tokenPayload.model || 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Kore',
              },
            },
          },
          inputAudioTranscription: {
            languageCodes: [selectedLanguage],
            mode: 'SMART',
          },
          outputAudioTranscription: {},
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            if (mountedRef.current) setStatus('Listening…');
          },
          onmessage: (message: any) => {
            try {
              const content = message?.serverContent;
              if (!content) return;

              // Google documents input transcription as an independent
              // server message with no guaranteed ordering relative to
              // turnComplete. Always consume it before any lifecycle action.
              if (content.inputTranscription?.text) {
                setInputTranscript((prev) => prev + content.inputTranscription.text);
              }

              if (content.interimInputTranscription?.text) {
                // Show interim speech immediately so the user can verify that
                // the microphone/audio pipeline is actually working.
                setInputTranscript((prev) => {
                  const marker = '…';
                  const base = prev.endsWith(marker) ? prev.slice(0, -marker.length) : prev;
                  return base + content.interimInputTranscription.text + marker;
                });
              }

              if (content.outputTranscription?.text) {
                setOutputTranscript((prev) => prev + content.outputTranscription.text);
              }

              if (content.turnComplete && mountedRef.current) {
                setStatus('Listening…');
              }
            } catch (e) {
              if (mountedRef.current) {
                setError(e instanceof Error ? e.message : 'Could not process Gemini Live response.');
              }
            }
          },
          onerror: (event: any) => {
            if (mountedRef.current) {
              const message = event?.message || event?.error?.message || 'Gemini Live connection failed.';
              setError(message);
              setStatus('Connection error');
              setActive(false);
              setConnecting(false);
            }
          },
          onclose: (event: any) => {
            if (mountedRef.current && sessionRef.current === session) {
              const reason = event?.reason || '';
              setStatus(reason ? `Voice ended: ${reason}` : 'Voice session ended');
              setActive(false);
              setConnecting(false);
            }
          },
        },
      });

      sessionRef.current = session;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      sourceRef.current = source;
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const liveSession = sessionRef.current;
        if (!liveSession) return;

        try {
          const input = event.inputBuffer.getChannelData(0);
          const pcm = floatToPcm16(input, 16000, audioContext.sampleRate);

          liveSession.sendRealtimeInput({
            audio: {
              data: bytesToBase64(pcm),
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch (e) {
          if (mountedRef.current) {
            setError(e instanceof Error ? e.message : 'Microphone audio could not be sent.');
          }
        }
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      setActive(true);
      setConnecting(false);
      setStatus('Listening…');
    } catch (e: any) {
      closeSession();

      if (mountedRef.current) {
        setConnecting(false);
        setActive(false);

        const message = String(e?.message || 'Unable to start voice assistant.');
        setError(
          message.toLowerCase().includes('permission')
            ? 'Microphone permission was denied. Allow microphone access for this site and try again.'
            : message,
        );
        setStatus('Unable to start');
      }
    }
  };

  const stopVoice = () => {
    const session = sessionRef.current;
    if (!session) {
      closeSession();
      return;
    }

    setStatus('Finishing transcription…');

    try {
      // Official Live API flow: when microphone input ends, send
      // audioStreamEnd rather than immediately destroying the session.
      session.sendRealtimeInput({ audioStreamEnd: true });
    } catch {}

    disposeLocalAudio();

    // Keep the SDK session alive briefly so the independent final
    // inputTranscription message can reach the callback.
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
    }

    stopTimerRef.current = window.setTimeout(() => {
      closeSession();
    }, 3500);

    setActive(false);
    setConnecting(false);
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

        <span className="text-[10px] text-slate-500">{status}</span>
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
