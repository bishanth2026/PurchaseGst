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
  const silentGainRef = useRef<GainNode | null>(null);
  const mountedRef = useRef(true);
  const manualStopRef = useRef(false);
  const reconnectingRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const stableConnectionTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const sessionHandleRef = useRef<string | null>(null);
  // Gemini ephemeral tokens are single-use for starting a new session, but the
  // same token can be used to resume that session. Keep the original token for
  // resumption instead of provisioning a brand-new token on every reconnect.
  const liveTokenRef = useRef<string | null>(null);
  const liveTokenExpiresAtRef = useRef<number>(0);
  const systemInstructionRef = useRef('');
  const selectedLanguageRef = useRef<'en-IN' | 'ml-IN'>(selectedLanguage);
  const nextPlayTimeRef = useRef(0);

  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  const appendInputTranscript = (text: string, interim = false) => {
    if (!text) return;
    setInputTranscript((prev) => {
      const base = prev.endsWith('…') ? prev.slice(0, -1) : prev;
      return base + text + (interim ? '…' : '');
    });
  };

  const playPcm24k = (base64: string) => {
    const audioContext = audioContextRef.current;
    if (!audioContext || !base64) return;

    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
      if (!pcm.length) return;

      const audioBuffer = audioContext.createBuffer(1, pcm.length, 24000);
      const channel = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      const startAt = Math.max(audioContext.currentTime + 0.02, nextPlayTimeRef.current);
      source.start(startAt);
      nextPlayTimeRef.current = startAt + audioBuffer.duration;
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? 'AI audio playback failed: ' + e.message : 'AI audio playback failed.');
      }
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const clearStableConnectionTimer = () => {
    if (stableConnectionTimerRef.current !== null) {
      window.clearTimeout(stableConnectionTimerRef.current);
      stableConnectionTimerRef.current = null;
    }
  };

  const disposeLocalAudio = () => {
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    try { silentGainRef.current?.disconnect(); } catch {}
    try { streamRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
    try { audioContextRef.current?.close(); } catch {}

    processorRef.current = null;
    sourceRef.current = null;
    silentGainRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
    nextPlayTimeRef.current = 0;
  };

  const closeSession = () => {
    manualStopRef.current = true;
    clearReconnectTimer();
    clearStableConnectionTimer();
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

  const getToken = async () => {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: selectedLanguageRef.current }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.token) {
      throw new Error(payload?.error || 'Could not obtain a secure Gemini Live session token.');
    }
    return payload;
  };

  const connectLiveSession = async (resumeHandle: string | null = null, forceFreshToken = false) => {
    let tokenPayload: any;

    // A resumption must use the token that created the original Live session.
    // Provisioning a new token here creates a different authorization context
    // and can cause the resumed WebSocket to be rejected.
    const cachedToken = liveTokenRef.current;
    const cachedExpiry = liveTokenExpiresAtRef.current;
    if (!forceFreshToken && resumeHandle && cachedToken && Date.now() < cachedExpiry) {
      tokenPayload = {
        token: cachedToken,
        model: 'gemini-3.8-live',
      };
    } else {
      tokenPayload = await getToken();
      liveTokenRef.current = tokenPayload.token;
      liveTokenExpiresAtRef.current = tokenPayload.expiresAt
        ? new Date(tokenPayload.expiresAt).getTime()
        : Date.now() + 29 * 60 * 1000;
    }
    // Ephemeral Live tokens are v1beta credentials. Pin the SDK connection
    // explicitly so a future SDK default cannot route the WebSocket elsewhere.
    const ai = new GoogleGenAI({ apiKey: tokenPayload.token, apiVersion: 'v1beta' });
    const model = tokenPayload.model || 'gemini-3.8-live';
    let session: any = null;

    session = await ai.live.connect({
      model,
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
          languageCodes: [selectedLanguageRef.current],
          mode: 'SMART',
        },
        outputAudioTranscription: {},
        sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
        contextWindowCompression: { slidingWindow: {} },
        systemInstruction: systemInstructionRef.current,
      },
      callbacks: {
        onopen: () => {
          if (mountedRef.current) setStatus(resumeHandle ? 'Voice connection restored…' : 'Listening…');
        },

        onmessage: (message: any) => {
          try {
            if (message?.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
              sessionHandleRef.current = message.sessionResumptionUpdate.newHandle;
            }

            if (message?.goAway) {
              const rawTime = message.goAway.timeLeft;
              const seconds = typeof rawTime === 'number'
                ? rawTime
                : Number(String(rawTime || '').replace('s', '')) || 1;

              clearReconnectTimer();
              reconnectTimerRef.current = window.setTimeout(
                () => {
                  if (!manualStopRef.current) {
                    void reconnectLiveSession(sessionHandleRef.current);
                  }
                },
                Math.max(100, Math.floor(seconds * 1000) - 300),
              );

              if (mountedRef.current) setStatus('Refreshing voice connection…');
              return;
            }

            const content = message?.serverContent;
            if (!content) return;

            if (content.interimInputTranscription?.text) {
              appendInputTranscript(content.interimInputTranscription.text, true);
            }

            if (content.inputTranscription?.text) {
              appendInputTranscript(content.inputTranscription.text, false);
            }

            if (content.outputTranscription?.text) {
              setOutputTranscript((prev) => prev + content.outputTranscription.text);
            }

            if (content.interrupted) {
              nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
            }

            const parts = content.modelTurn?.parts || [];
            for (const part of parts) {
              if (part?.inlineData?.data) playPcm24k(part.inlineData.data);
            }

            if (parts.length && mountedRef.current) setStatus('AI responding…');
            if (content.turnComplete && mountedRef.current) setStatus('Listening…');
          } catch (e) {
            if (mountedRef.current) {
              setError(e instanceof Error ? e.message : 'Could not process Gemini Live response.');
            }
          }
        },

        onerror: (event: any) => {
          if (!mountedRef.current || manualStopRef.current) return;
          const message = event?.message || event?.error?.message || 'Gemini Live connection error.';
          setError('Voice connection interrupted: ' + message);
          setStatus('Reconnecting…');
        },

        onclose: (event: any) => {
          if (!mountedRef.current || manualStopRef.current || sessionRef.current !== session) return;

          sessionRef.current = null;

          const code = Number(event?.code || 0);
          const reason = String(event?.reason || '');
          const isServerFailure = code === 1011 || /internal error|server/i.test(reason);

          setError(
            isServerFailure
              ? 'Gemini Live connection was interrupted. Reconnecting automatically…'
              : 'Voice connection ended' + (code ? ' (code ' + code + ')' : '') + (reason ? ': ' + reason : '.'),
          );
          setStatus('Reconnecting…');

          clearReconnectTimer();

          const attempt = reconnectAttemptRef.current;
          if (attempt >= 8) {
            clearReconnectTimer();
            clearStableConnectionTimer();
            if (mountedRef.current) {
              setStatus('Voice connection failed');
              setError('Gemini Live could not maintain a voice connection. Please tap Start Live Voice to try again.');
              setActive(false);
              setConnecting(false);
            }
            return;
          }
          reconnectAttemptRef.current = attempt + 1;
          const delay = Math.min(3000, 500 + attempt * 500);

          reconnectTimerRef.current = window.setTimeout(async () => {
            if (manualStopRef.current || !mountedRef.current) return;

            try {
              await reconnectLiveSession(sessionHandleRef.current);
            } catch (reconnectError: any) {
              if (reconnectAttemptRef.current < 8 && mountedRef.current && !manualStopRef.current) {
                const detail = String(reconnectError?.message || 'Unknown reconnect error.');
                setError('Voice reconnect failed: ' + detail);
                setStatus('Retrying voice connection…');
                reconnectTimerRef.current = window.setTimeout(() => {
                  if (!manualStopRef.current) {
                    reconnectAttemptRef.current += 1;
                    void reconnectLiveSession(sessionHandleRef.current);
                  }
                }, 1500);
              } else if (mountedRef.current) {
                setStatus('Voice connection failed');
                setError('Gemini Live could not reconnect. Please tap Start Live Voice to try again.');
                setActive(false);
                setConnecting(false);
              }
            }
          }, delay);
        },
      },
    });

    sessionRef.current = session;
    reconnectingRef.current = false;
    clearStableConnectionTimer();
    // Do not reset the retry budget immediately. If a socket opens and then
    // closes again, an immediate reset creates an endless reconnect loop.
    // Reset only after the connection has remained healthy for 10 seconds.
    stableConnectionTimerRef.current = window.setTimeout(() => {
      stableConnectionTimerRef.current = null;
      reconnectAttemptRef.current = 0;
    }, 10000);
    setActive(true);
    setConnecting(false);
    setError('');
    setStatus('Listening…');

    return session;
  };

  const reconnectLiveSession = async (resumeHandle: string | null) => {
    if (reconnectingRef.current || manualStopRef.current || !mountedRef.current) return;
    reconnectingRef.current = true;

    try {
      if (mountedRef.current) setStatus('Reconnecting securely…');

      try {
        await connectLiveSession(resumeHandle);
      } catch (resumeError) {
        if (resumeHandle) {
          sessionHandleRef.current = null;
          await connectLiveSession(null, true);
        } else {
          throw resumeError;
        }
      }
    } finally {
      reconnectingRef.current = false;
    }
  };

  const startVoice = async () => {
    if (active || connecting) return;

    manualStopRef.current = false;
    clearReconnectTimer();
    sessionHandleRef.current = null;
    liveTokenRef.current = null;
    liveTokenExpiresAtRef.current = 0;
    reconnectAttemptRef.current = 0;
    clearStableConnectionTimer();
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

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();

      systemInstructionRef.current = [
        'You are the Biznexco real-time voice assistant.',
        'Answer questions about GST, accounting, finance, business, and the Biznexco Purchase Invoice Automation application.',
        'Speak naturally in the user selected language: ' +
          (selectedLanguageRef.current === 'ml-IN' ? 'Malayalam' : 'English (India)') + '.',
        'Use only the supplied current-app context for claims about live invoice counts, amounts, suppliers, reconciliation results, ITC, dates, and statuses.',
        'Never invent app data. If the supplied context does not contain the answer, say that it is not available.',
        'You are read-only in this voice phase. Do not claim that you approved, deleted, changed, uploaded, or reconciled anything.',
        'For tax/legal matters, provide informational guidance and recommend professional verification where appropriate.',
        'Keep spoken answers concise and practical.',
        'Current Biznexco context:',
        JSON.stringify(context),
      ].join('\n');

      setStatus('Getting secure Gemini session…');
      await connectLiveSession(null);

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      sourceRef.current = source;
      processorRef.current = processor;
      silentGainRef.current = silentGain;

      processor.onaudioprocess = (event) => {
        const liveSession = sessionRef.current;
        if (!liveSession || manualStopRef.current) return;

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
          if (mountedRef.current && !manualStopRef.current) {
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
    manualStopRef.current = true;
    clearReconnectTimer();
    clearStableConnectionTimer();

    const session = sessionRef.current;
    if (!session) {
      closeSession();
      return;
    }

    setStatus('Finishing transcription…');

    try {
      session.sendRealtimeInput({ audioStreamEnd: true });
    } catch {}

    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    try { streamRef.current?.getTracks().forEach((track) => track.stop()); } catch {}

    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;

    window.setTimeout(() => {
      try { session.close?.(); } catch {}
      if (sessionRef.current === session) sessionRef.current = null;
      try { audioContextRef.current?.close(); } catch {}
      audioContextRef.current = null;

      if (mountedRef.current) {
        setActive(false);
        setConnecting(false);
        setStatus('Ready');
      }
    }, 1500);
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
