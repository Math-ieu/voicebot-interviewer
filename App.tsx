
import React, { useState, useRef, useCallback, useEffect } from 'react';
// FIX: Removed LiveSession as it is not an exported member of '@google/genai'.
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { InterviewState, TranscriptEntry } from './types';
import { MODEL_NAME, SYSTEM_INSTRUCTION } from './constants';
import { decode, encode, decodeAudioData } from './utils/audio';
import TranscriptDisplay from './components/TranscriptDisplay';
import StatusIndicator from './components/StatusIndicator';

const MicrophoneIcon: React.FC<{className: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM11.999 15.5c-2.49 0-4.5-2.01-4.5-4.5h-2c0 3.54 2.72 6.44 6.25 6.91v2.84h-2.5v2h5v-2h-2.5v-2.84C16.23 21.94 18.999 19.04 18.999 15.5h-2c0 2.49-2.01 4.5-4.5 4.5Z" />
    </svg>
);

const StopIcon: React.FC<{className: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
    </svg>
);


export default function App() {
  const [interviewState, setInterviewState] = useState<InterviewState>(InterviewState.IDLE);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FIX: Replaced non-existent LiveSession type with `any` for the session promise ref.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const outputAudioSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  
  const aiRef = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    if (!process.env.API_KEY) {
      setError("La clé API Gemini n'est pas configurée.");
      setInterviewState(InterviewState.ERROR);
    } else {
       aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
     // Cleanup on unmount
    return () => {
      stopInterview();
    };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMessage = useCallback(async (message: LiveServerMessage) => {
    if (message.serverContent?.outputTranscription) {
        const text = message.serverContent.outputTranscription.text;
        currentOutputTranscriptionRef.current += text;
        // Live update for bot's partial transcript
        setTranscript(prev => {
            const last = prev[prev.length - 1];
            if (last && last.speaker === 'bot') {
                const newLast = { ...last, text: currentOutputTranscriptionRef.current };
                return [...prev.slice(0, -1), newLast];
            }
            return prev;
        });
    } else if (message.serverContent?.inputTranscription) {
        const text = message.serverContent.inputTranscription.text;
        currentInputTranscriptionRef.current += text;
        // Live update for user's partial transcript
        setTranscript(prev => {
            const last = prev[prev.length - 1];
            if (last && last.speaker === 'user') {
                const newLast = { ...last, text: currentInputTranscriptionRef.current };
                return [...prev.slice(0, -1), newLast];
            }
            return prev;
        });
    }

    if (message.serverContent?.turnComplete) {
        const finalInput = currentInputTranscriptionRef.current.trim();
        const finalOutput = currentOutputTranscriptionRef.current.trim();
        
        setTranscript(prev => {
            const newTranscript = [...prev];
            const last = newTranscript[newTranscript.length - 1];
             if (last?.speaker === 'bot' && finalOutput) {
                 last.text = finalOutput;
             } else if (last?.speaker === 'user' && finalInput) {
                 last.text = finalInput;
             }
            return newTranscript;
        });

        currentInputTranscriptionRef.current = '';
        currentOutputTranscriptionRef.current = '';
    }

    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
    if (base64Audio) {
        setIsBotSpeaking(true);
        const outputAudioContext = outputAudioContextRef.current;
        if (outputAudioContext) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
            
            const source = outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputAudioContext.destination);

            source.addEventListener('ended', () => {
                outputAudioSources.current.delete(source);
                if (outputAudioSources.current.size === 0) {
                    setIsBotSpeaking(false);
                    // Start a new turn for user input
                     if (currentInputTranscriptionRef.current === '' && currentOutputTranscriptionRef.current === '') {
                        setTranscript(prev => [...prev, {id: Date.now().toString() + 'user', speaker: 'user', text: ''}]);
                    }
                }
            });

            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            outputAudioSources.current.add(source);
        }
    }
  }, []);

  const startInterview = useCallback(async () => {
    if (!aiRef.current) return;
    setInterviewState(InterviewState.CONNECTING);
    setError(null);
    setTranscript([]);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';


    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Init audio contexts
      // FIX: Cast window to `any` to access vendor-prefixed `webkitAudioContext` for cross-browser compatibility.
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });


      sessionPromiseRef.current = aiRef.current.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction: SYSTEM_INSTRUCTION
        },
        callbacks: {
          onopen: () => {
            setInterviewState(InterviewState.ACTIVE);
            
             // Start a new turn for bot introduction
            setTranscript(prev => [...prev, {id: Date.now().toString() + 'bot', speaker: 'bot', text: ''}]);

            const inputAudioContext = inputAudioContextRef.current;
            if (inputAudioContext && mediaStreamRef.current) {
                mediaStreamSourceRef.current = inputAudioContext.createMediaStreamSource(mediaStreamRef.current);
                scriptProcessorRef.current = inputAudioContext.createScriptProcessor(4096, 1, 1);
                
                scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                    const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                    const l = inputData.length;
                    const int16 = new Int16Array(l);
                    for (let i = 0; i < l; i++) {
                        int16[i] = inputData[i] * 32768;
                    }
                    const pcmBlob: Blob = {
                        data: encode(new Uint8Array(int16.buffer)),
                        mimeType: 'audio/pcm;rate=16000',
                    };

                    sessionPromiseRef.current?.then((session) => {
                        session.sendRealtimeInput({ media: pcmBlob });
                    });
                };
                
                mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
                scriptProcessorRef.current.connect(inputAudioContext.destination);
            }
          },
          onmessage: handleMessage,
          onerror: (e: ErrorEvent) => {
            console.error(e);
            setError("Une erreur est survenue pendant l'entretien. Veuillez réessayer.");
            setInterviewState(InterviewState.ERROR);
            stopInterview();
          },
          onclose: () => {
             // This can be triggered by server, so we handle state change
             if(interviewState !== InterviewState.STOPPING && interviewState !== InterviewState.IDLE) {
                setInterviewState(InterviewState.FINISHED);
             }
          }
        }
      });

    } catch (err) {
      console.error(err);
      setError("Impossible d'accéder au microphone. Veuillez autoriser l'accès et réessayer.");
      setInterviewState(InterviewState.ERROR);
    }
  }, [handleMessage, interviewState]);

 const stopInterview = useCallback(() => {
    if (interviewState === InterviewState.IDLE || interviewState === InterviewState.FINISHED) return;

    setInterviewState(InterviewState.STOPPING);

    sessionPromiseRef.current?.then((session) => {
      session.close();
      sessionPromiseRef.current = null;
    });

    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    if (scriptProcessorRef.current && mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current = null;
        mediaStreamSourceRef.current = null;
    }

    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;

    outputAudioSources.current.forEach(source => source.stop());
    outputAudioSources.current.clear();
    setIsBotSpeaking(false);
    nextStartTimeRef.current = 0;

    setInterviewState(InterviewState.FINISHED);
}, [interviewState]);


  const isInterviewActive = interviewState === InterviewState.ACTIVE || interviewState === InterviewState.CONNECTING;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-4xl h-[90vh] flex flex-col bg-gray-800 rounded-2xl shadow-2xl p-4 md:p-6 border border-gray-700">
        <header className="text-center mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-indigo-400">Voicebot de Pré-entretien</h1>
          <p className="text-gray-400 text-sm md:text-base">Un assistant IA pour vos recrutements</p>
        </header>
        
        <TranscriptDisplay transcript={transcript} />
        
        <footer className="mt-4 flex flex-col items-center space-y-4">
            <StatusIndicator state={interviewState} isBotSpeaking={isBotSpeaking} />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
                onClick={isInterviewActive ? stopInterview : startInterview}
                disabled={interviewState === InterviewState.CONNECTING || interviewState === InterviewState.ERROR && !aiRef.current}
                className={`flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 ease-in-out shadow-lg focus:outline-none focus:ring-4 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed
                ${isInterviewActive
                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 text-white'
                }`}
            >
                {isInterviewActive ? <StopIcon className="w-8 h-8"/> : <MicrophoneIcon className="w-8 h-8" />}
            </button>
        </footer>
      </div>
    </div>
  );
}
