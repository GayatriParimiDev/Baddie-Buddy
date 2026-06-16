import React, { useState, useEffect, useRef } from "react";
import { PracticeQuestion, SpeakingSessionResult, UserProfile, SpeakingCorrection } from "../types";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { 
  Mic, Square, Volume2, Sparkles, User, ShieldAlert, CheckCircle2, 
  HelpCircle, ClipboardList, Loader2, Play, ChevronLeft, Calendar,
  VolumeX, AlertTriangle, ArrowRight, BookOpen, Clock, HeartHandshake,
  ArrowUpRight, WifiOff, Info, X, Activity, RefreshCw
} from "lucide-react";
import { speechLogger, SpeechLogEntry } from "../utils/speechLogger";

interface SpeakingSessionProps {
  question: PracticeQuestion;
  questionsPlaylist?: PracticeQuestion[]; // Optional playlist for tailored diagnostic course
  userProfile: UserProfile | null;
  onClose: () => void;
  onFinishSession: () => void;
}

export default function SpeakingSession({
  question: initialQuestion,
  questionsPlaylist,
  userProfile,
  onClose,
  onFinishSession
}: SpeakingSessionProps) {
  // Playlist State & Selector
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const question = questionsPlaylist && questionsPlaylist.length > 0 ? questionsPlaylist[playlistIndex] : initialQuestion;

  // Config States
  const [selectedAgent, setSelectedAgent] = useState<"partner" | "examiner">("partner");
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [voiceGender, setVoiceGender] = useState<"female" | "male">("female");

  // Flow States
  const [sessionState, setSessionState] = useState<"setup" | "preparing" | "speaking" | "evaluating" | "feedback">("setup");
  const [preparationTimeLeft, setPreparationTimeLeft] = useState<number>(60);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [fillerWords, setFillerWords] = useState({ um: 0, uh: 0, like: 0, youknow: 0 });
  const [micError, setMicError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [voiceSystemStatus, setVoiceSystemStatus] = useState<"active" | "silence" | "network-warning" | "mic-error" | "paused">("paused");

  // Speech Status Logger States
  const [sessionLogs, setSessionLogs] = useState<SpeechLogEntry[]>([]);
  const [activeToast, setActiveToast] = useState<SpeechLogEntry | null>(null);
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);

  // AI evaluation states
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<any>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  // Audio wave decoration
  const [waveHeights, setWaveHeights] = useState<number[]>([15, 20, 10, 40, 25, 45, 15, 30, 20, 15]);

  // Audio synthesis
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // Recognition reference
  const recognitionRef = useRef<any>(null);
  const recognitionActiveRef = useRef(false);
  const hadNetworkErrorRef = useRef(false);
  const networkRetryCountRef = useRef(0);
  const networkErrorTimeoutRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // Keep refs for active speech elements to bypass stale closures in unified events
  const isRecordingRef = useRef(isRecording);
  const micErrorRef = useRef(micError);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    micErrorRef.current = micError;
  }, [micError]);

  // Synchronize with speech status tracker logger subscriptions
  useEffect(() => {
    const unsubscribe = speechLogger.subscribe((allLogs, latestLog) => {
      setSessionLogs(allLogs);
      if (latestLog) {
        // Show toasts for alerts, errors, connection successes, and silences
        if (latestLog.type === "success" || latestLog.type === "warning" || latestLog.type === "error" || latestLog.category === "silence") {
          setActiveToast(latestLog);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle toast timeout
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => {
        setActiveToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  const safeStartRecognition = () => {
    if (recognitionRef.current) {
      if (recognitionActiveRef.current) {
        console.log("SpeechRecognition already active, skipping start.");
        return;
      }
      try {
        recognitionRef.current.start();
        recognitionActiveRef.current = true;
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        if (msg.includes("already started")) {
          recognitionActiveRef.current = true;
        } else {
          console.warn("Could not start SpeechRecognition:", e);
        }
      }
    }
  };

  const safeStopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    recognitionActiveRef.current = false;
  };

  const disposeRecognition = () => {
    if (networkErrorTimeoutRef.current) {
      clearTimeout(networkErrorTimeoutRef.current);
      networkErrorTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        const rec = recognitionRef.current;
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      } catch (e) {
        console.warn("SpeechRecognition aborted or already stopped gracefully:", e);
      }
      recognitionRef.current = null;
    }
    recognitionActiveRef.current = false;
    hadNetworkErrorRef.current = false;
    networkRetryCountRef.current = 0;
  };

  // Prep Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let rec: any = null;

    if (SpeechRecognition) {
      speechLogger.log("info", "recognition", "Initializing speech recognition engine...");
      rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        recognitionActiveRef.current = true;
        hadNetworkErrorRef.current = false;
        networkRetryCountRef.current = 0;
        setNetworkError(null);
        setVoiceSystemStatus("active");
        speechLogger.log("success", "recognition", "Microphone stream activated. Speech recognition session started.");
      };

      rec.onresult = (e: any) => {
        // Any healthy result resets any transient network warning
        hadNetworkErrorRef.current = false;
        networkRetryCountRef.current = 0;
        setNetworkError(null);
        setVoiceSystemStatus("active");

        let interim = "";
        let final = "";

        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            final += e.results[i][0].transcript + " ";
          } else {
            interim += e.results[i][0].transcript;
          }
        }

        if (final) {
          setTranscript((prev) => prev + final);
          analyzeFillers(final);
          speechLogger.log("info", "recognition", `Detected segment: "${final.trim()}"`);
        }
        setInterimTranscript(interim);
      };

      rec.onerror = (err: any) => {
        const errorType = err?.error || "";
        console.error("Speech recognition error:", errorType, err);

        if (errorType === "not-allowed" || errorType === "audio-capture" || errorType === "service-not-allowed") {
          const isBlocked = errorType === "not-allowed";
          const detailsStr = isBlocked 
            ? "Microphone permission is denied. Click 'Open in New Tab' to grant permissions." 
            : "No active audio capture hardware detected.";
          setMicError(
            "Microphone permission is denied or unsupported in this frame. " +
            "To resolve this, please open the application in a new tab by clicking 'Open in New Tab' at the top right of the page."
          );
          setVoiceSystemStatus("mic-error");
          speechLogger.log("error", isBlocked ? "permission" : "audio-capture", detailsStr, errorType);
          setIsRecording(false);
          recognitionActiveRef.current = false;
          try {
            rec.stop();
          } catch (e) {}
        } else if (errorType === "network") {
          hadNetworkErrorRef.current = true;
          networkRetryCountRef.current += 1;
          const attempt = networkRetryCountRef.current;
          const delaySecs = Math.min(2 * Math.pow(2, attempt), 12);
          setNetworkError(
            `Connection to Google Speech API was temporarily interrupted. Retrying automatically with connection backoff in ${delaySecs} seconds (Attempt #${attempt}). ` +
            "Please speak close to the microphone and keep your internet active."
          );
          setVoiceSystemStatus("network-warning");
          speechLogger.log("warning", "connection", `Voice connection interrupted. Backoff retry scheduled in ${delaySecs}s.`, errorType);
        } else if (errorType === "no-speech") {
          console.log("No speech detected - normal behavior.");
          setVoiceSystemStatus("silence");
          speechLogger.log("info", "silence", "Silence detected. Keeping session active, waiting for speech input...", errorType);
        } else {
          setVoiceSystemStatus("network-warning");
          speechLogger.log("warning", "recognition", `Encountered recognition event: ${errorType}`, errorType);
        }
      };

      rec.onend = () => {
        recognitionActiveRef.current = false;
        speechLogger.log("info", "recognition", "Microphone session suspended / connection closed.");
        
        // Clear previous connection timeouts if any exist
        if (networkErrorTimeoutRef.current) {
          clearTimeout(networkErrorTimeoutRef.current);
          networkErrorTimeoutRef.current = null;
        }

        // Only attempt to restart if still recording and we haven't hit a block error
        if (isRecordingRef.current && !micErrorRef.current) {
          if (hadNetworkErrorRef.current) {
            // Apply exponential backoff delay to allow connection/rate-limit recovery
            const attempt = networkRetryCountRef.current;
            const backoffDelay = Math.min(2000 * Math.pow(2, attempt), 12000);
            speechLogger.log("info", "connection", `Scheduling automatic retry backoff in ${backoffDelay / 1000} seconds.`);
            setVoiceSystemStatus("network-warning");
            networkErrorTimeoutRef.current = setTimeout(() => {
              if (isRecordingRef.current && !micErrorRef.current) {
                safeStartRecognition();
              }
            }, backoffDelay);
          } else {
            // Slight delay (200ms) prevents infinite tight loops and handles browser API cooldowns
            networkErrorTimeoutRef.current = setTimeout(() => {
              if (isRecordingRef.current && !micErrorRef.current) {
                safeStartRecognition();
              }
            }, 200);
          }
        } else {
          setVoiceSystemStatus("paused");
        }
      };

      recognitionRef.current = rec;
    } else {
      speechLogger.log("error", "audio-capture", "Web Speech API is not supported in this browser version.");
    }

    return () => {
      if (rec) {
        try {
          rec.onstart = null;
          rec.onresult = null;
          rec.onerror = null;
          rec.onend = null;
          rec.abort();
        } catch (e) {
          console.warn("SpeechRecognition unmount cleanup error:", e);
        }
      }
      stopAllMedia();
    };
  }, []);

  // Simulate waves during speaker activity
  useEffect(() => {
    let interval: any = null;
    if (isRecording || isAiSpeaking) {
      interval = setInterval(() => {
        setWaveHeights(Array.from({ length: 15 }, () => Math.floor(Math.random() * (isRecording ? 50 : 35)) + 10));
      }, 100);
    } else {
      setWaveHeights(Array(15).fill(12));
    }
    return () => clearInterval(interval);
  }, [isRecording, isAiSpeaking]);

  const stopAllMedia = () => {
    disposeRecognition();
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (networkErrorTimeoutRef.current) {
      clearTimeout(networkErrorTimeoutRef.current);
      networkErrorTimeoutRef.current = null;
    }
    setNetworkError(null);
    window.speechSynthesis?.cancel();
  };

  // Speaks examiner prompt using browser speechSynthesis standard
  const handleTriggerSpeech = (text: string) => {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    setIsAiSpeaking(true);

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Config speed
    if (speed === "slow") utterance.rate = 0.72;
    else if (speed === "fast") utterance.rate = 1.25;
    else utterance.rate = 1.0;

    // Config gender options from local voices
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferred = voices.find(v => 
        (voiceGender === "female" && (v.name.includes("Zira") || v.name.includes("Samantha") || v.name.includes("Google US English"))) ||
        (voiceGender === "male" && (v.name.includes("David") || v.name.includes("Hazel") || v.name.includes("Microsoft")))
      );
      if (preferred) utterance.voice = preferred;
    }

    utterance.onend = () => {
      setIsAiSpeaking(false);
    };

    utterance.onerror = () => {
      setIsAiSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Filler words counting
  const analyzeFillers = (text: string) => {
    const raw = text.toLowerCase();
    const umCount = (raw.match(/\bumm*\b|\buhh*\b/g) || []).length;
    const uhCount = (raw.match(/\buh\b/g) || []).length;
    const likeCount = (raw.match(/\blike\b/g) || []).length;
    const youknowCount = (raw.match(/\byou know\b/g) || []).length;

    setFillerWords((prev) => ({
      um: prev.um + umCount,
      uh: prev.uh + uhCount,
      like: prev.like + likeCount,
      youknow: prev.youknow + youknowCount,
    }));
  };

  // Preparation counter for Part 2 cue card
  const startPreparationCountdown = () => {
    setSessionState("preparing");
    setPreparationTimeLeft(60);

    const agentGreeting = `I have selected the Kiran Makkar cue card: ${question.topic}. You have 1 minute to prepare your response. Your preparation timer begins... now.`;
    handleTriggerSpeech(agentGreeting);

    timerRef.current = setInterval(() => {
      setPreparationTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          startSpeakingPhase();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSkipPrep = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    startSpeakingPhase();
  };

  // Transition into active recording/speaking
  const startSpeakingPhase = () => {
    setSessionState("speaking");
    setMicError(null);
    setIsRecording(true);
    setTranscript("");
    setInterimTranscript("");
    setVoiceSystemStatus("active");
    window.speechSynthesis?.cancel();

    speechLogger.log("info", "recognition", "Active speaking session initialized.");

    const speakerTrigger = selectedAgent === "examiner" 
      ? "Preparation time is complete. Please begin speaking about your topic now. Try to speak up to two minutes."
      : "Awesome! Let me hear your thoughts on this speaking challenge. Go ahead whenever you're ready!";
    
    handleTriggerSpeech(speakerTrigger);

    setTimeout(() => {
      safeStartRecognition();
    }, 2800);
  };

  // Start Voice simulation immediately if Part 1 or Part 3
  const handleStartPlainPractice = () => {
    setSessionState("speaking");
    setMicError(null);
    setIsRecording(true);
    setTranscript("");
    setInterimTranscript("");
    setVoiceSystemStatus("active");
    
    speechLogger.log("info", "recognition", "Direct speaking session initialized without prep draft.");

    const intro = selectedAgent === "examiner"
      ? `This is the official IELTS speaking evaluator model. Let's begin speaking. Your question is: ${question.question}`
      : `What a lovely topic! Tell me, what's your take or opinion on this: ${question.question}`;
    
    handleTriggerSpeech(intro);

    setTimeout(() => {
      safeStartRecognition();
    }, 3250);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    safeStopRecognition();
    setVoiceSystemStatus("paused");
    speechLogger.log("info", "recognition", "Microphone stream suspended manually by user.");
  };

  const handleManualStartRecording = () => {
    setMicError(null);
    setIsRecording(true);
    setVoiceSystemStatus("active");
    safeStartRecognition();
    speechLogger.log("info", "recognition", "Microphone stream resumed manually by user.");
  };

  // Send transcription to Gemini fullstack evaluator agent
  const handleEvaluateAnswers = async () => {
    const finalText = transcript + interimTranscript;
    if (!finalText.trim()) {
      alert("Please speak or type some responses before submitting for IELTS Band Evaluation!");
      return;
    }

    setIsEvaluating(true);
    setEvalError(null);
    setSessionState("evaluating");
    window.speechSynthesis?.cancel();

    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalText,
          question: question.question,
          partType: question.partType,
          targetBand: userProfile?.targetBand || 7.5,
          currentBand: userProfile?.currentBand || 6.0
        })
      });

      if (!res.ok) {
        let details = "IELTS evaluation API generated a server error.";
        try {
          const errData = await res.json();
          if (errData.error) details = errData.error;
        } catch (_) {}
        throw new Error(details);
      }

      const results = await res.json();
      setEvaluationResult(results);

      // Award XP & Save session info if authenticated in Firebase Firestore
      if (userProfile && db) {
        const docRefName = `users/${userProfile.uid}/sessions`;
        try {
          await addDoc(collection(db, docRefName), {
            sessionType: question.partType === 2 ? "mock_test" : "practice",
            agent: selectedAgent,
            topic: question.topic,
            promptQuestion: question.question,
            transcript: finalText,
            overallBand: results.overallBand || 6.5,
            fluencyBand: results.fluencyBand || 6.5,
            vocabularyBand: results.vocabularyBand || 6.5,
            grammarBand: results.grammarBand || 6.5,
            pronunciationBand: results.pronunciationBand || 6.5,
            pronunciationDetails: results.pronunciationDetails || null,
            strengths: results.strengths || [],
            weaknesses: results.weaknesses || [],
            corrections: results.corrections || [],
            actionPlan: results.actionPlan || [],
            examinerCommentary: results.examinerCommentary || "",
            coachFeedback: results.coachFeedback || "",
            fillerWordsCount: Object.values(fillerWords).reduce((a: number, b: number) => a + b, 0),
            createdAt: new Date().toISOString()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, docRefName);
        }

        // Update profile latest scores & streak
        const profileRef = doc(db, "users", userProfile.uid);
        try {
          await updateDoc(profileRef, {
            xp: (userProfile.xp || 100) + (question.partType === 2 ? 100 : 40),
            currentBand: results.overallBand,
            sessionsCompleted: (userProfile.sessionsCompleted || 0) + 1,
            lastPracticeDate: new Date().toISOString().split("T")[0]
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${userProfile.uid}`);
        }
      }

      setSessionState("feedback");
    } catch (err: any) {
      console.error(err);
      // Save error message on evaluation panel so they can retry smoothly
      setEvalError(err.message || "Failed to contact the AI evaluation engine.");
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 relative">
      {/* Ambient Background Spotlights inside Speaking Room */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded-[3rem]">
        <div className="absolute -top-1/4 -left-1/4 w-[70%] h-[70%] bg-[#5427e6]/8 rounded-full blur-[110px] animate-pulse duration-[8000ms]"></div>
        <div className="absolute -bottom-1/4 -right-1/4 w-[80%] h-[80%] bg-[#1351d3]/8 rounded-full blur-[130px] animate-pulse duration-[10000ms]"></div>
      </div>
      
      {sessionState === "setup" && (
        <div className="rounded-[2.5rem] p-8 shadow-xs glass-panel relative overflow-hidden z-10 border border-white/40 dark:border-white/5 animate-in fade-in zoom-in-95 duration-500">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#5427e6]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <span className="px-3 py-0.5 rounded-full text-[10px] uppercase font-black tracking-widest bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white">
              IELTS Speaking Part {question.partType}
            </span>
            <span className="text-xs text-slate-450 dark:text-zinc-400 font-bold">• Kiran Makkar Real Guesswork Card</span>
          </div>

          <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-2 relative z-10">{question.topic}</h2>
          <p className="text-sm text-slate-600 italic font-semibold leading-relaxed mb-8 relative z-10">
            "{question.question}"
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6 border-y border-slate-205/50 dark:border-zinc-800/80 relative z-10">
            {/* Choose Agent */}
            <div className="space-y-4">
              <h4 className="text-xs uppercase tracking-wider font-extrabold text-slate-400 tracking-widest">
                1. Select AI Speaking Agent
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedAgent("partner")}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    selectedAgent === "partner" 
                      ? "bg-gradient-to-r from-[#5427e6]/10 to-[#1351d3]/10 border-indigo-400 dark:border-indigo-800 ring-1 ring-indigo-500/10 shadow-md" 
                      : "bg-white/40 dark:bg-zinc-900/30 border-slate-200/50 dark:border-zinc-800/80 hover:bg-white/60 dark:hover:bg-zinc-800/40 text-[#484556] dark:text-zinc-300"
                  }`}
                >
                  <HeartHandshake className="h-5 w-5 text-[#5427e6] dark:text-indigo-400 mb-2" />
                  <span className="text-xs font-bold text-slate-900 block">Friendly Partner</span>
                  <span className="text-[10px] text-slate-500 mt-1 block leading-normal font-semibold">Helpful confidence building, casual talk.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAgent("examiner")}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    selectedAgent === "examiner" 
                      ? "bg-gradient-to-r from-[#5427e6]/10 to-[#1351d3]/10 border-indigo-400 dark:border-indigo-800 ring-1 ring-indigo-500/10 shadow-md" 
                      : "bg-white/40 dark:bg-zinc-900/30 border-slate-200/50 dark:border-zinc-800/80 hover:bg-white/60 dark:hover:bg-zinc-800/40 text-[#484556] dark:text-zinc-300"
                  }`}
                >
                  <ClipboardList className="h-5 w-5 text-[#1351d3] dark:text-indigo-400 mb-2" />
                  <span className="text-xs font-bold text-slate-900 block">IELTS Examiner</span>
                  <span className="text-[10px] text-slate-500 mt-1 block leading-normal font-semibold">Strict evaluation, prep timers, official card pacing.</span>
                </button>
              </div>
            </div>

            {/* Voice controls */}
            <div className="space-y-4">
              <h4 className="text-xs uppercase tracking-wider font-extrabold text-slate-400 tracking-widest">
                2. Pronunciation & Speed Configs
              </h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#484556] dark:text-zinc-400 font-bold">Speaking Pace:</span>
                  <div className="flex gap-1.5 font-bold">
                    {(["slow", "normal", "fast"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        className={`px-3 py-1.5 rounded-xl text-xs capitalize transition ${
                          speed === s 
                            ? "bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white shadow-md shadow-indigo-500/10 font-black" 
                            : "bg-white/50 dark:bg-[#1a1726]/40 border border-slate-200/50 dark:border-zinc-800 text-slate-600 hover:bg-white/75 dark:hover:bg-zinc-800/60"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#484556] dark:text-zinc-400 font-bold">Coach Gender Accent:</span>
                  <div className="flex gap-1.5 font-bold">
                    {(["female", "male"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setVoiceGender(g)}
                        className={`px-3 py-1.5 rounded-xl text-xs capitalize transition ${
                          voiceGender === g 
                            ? "bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white shadow-md shadow-indigo-500/10 font-black" 
                            : "bg-white/50 dark:bg-[#1a1726]/40 border border-slate-200/50 dark:border-zinc-800 text-slate-600 hover:bg-white/75 dark:hover:bg-zinc-800/60"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-between items-center relative z-10 font-bold">
            <button
              onClick={onClose}
              className="text-[#484556] hover:text-[#5427e6] dark:hover:text-white text-xs cursor-pointer transition-colors"
            >
              Cancel Practice
            </button>
            <button
              onClick={() => {
                if (question.partType === 2 && selectedAgent === "examiner") {
                  startPreparationCountdown();
                } else {
                  handleStartPlainPractice();
                }
              }}
              className="px-6 py-4 rounded-xl bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white font-extrabold max-w-sm flex items-center gap-2 shadow-lg hover:opacity-95 transition-all cursor-pointer shadow-indigo-650/15"
            >
              <span>Begin Voice Session</span>
              <Mic className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {sessionState === "preparing" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <BookOpen className="h-10 w-10 text-indigo-600 mx-auto mb-4 animate-bounce" />
          <h2 className="text-2xl font-black text-indigo-950 mb-2">Part 2 Preparation Period</h2>
          <p className="text-xs text-slate-505 mb-6 font-medium">Use this time to organize key transition statements on cue cards</p>

          <div className="mx-auto h-28 w-28 rounded-full border-4 border-indigo-105 border-t-indigo-600 flex items-center justify-center mb-8 relative bg-indigo-50/20">
            <span className="text-3xl font-black text-indigo-950">{preparationTimeLeft}s</span>
          </div>

          <div className="max-w-md mx-auto text-left rounded-2xl bg-slate-50 border border-slate-200 p-5 mb-8">
            <span className="text-[10px] uppercase font-extrabold text-slate-400 block mb-3 tracking-widest">Part 2 Prompt Checklist:</span>
            <ul className="text-xs text-slate-700 space-y-2.5">
              {question.cueCardSubQuestions?.map((sub, sIdx) => (
                <li key={sIdx} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>{sub}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={handleSkipPrep}
            className="px-6 py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-bold hover:bg-indigo-50/50 transition-all cursor-pointer"
          >
            I'm Ready - Skip Timer
          </button>
        </div>
      )}

      {sessionState === "speaking" && (
        <div className="rounded-[2.5rem] p-8 shadow-xs glass-panel relative z-10 border border-white/40 dark:border-white/5 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-200/50 dark:border-zinc-800/80">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${isRecording ? "bg-rose-500 animate-ping" : "bg-slate-400"}`}></div>
                <span className="text-xs font-black text-slate-800 dark:text-zinc-300">
                  {isRecording ? "Listening Continuously..." : "Session Paused"}
                </span>
              </div>

              {/* Status Action Button / Diagnostic Log */}
              <button
                type="button"
                onClick={() => setShowLogsDrawer(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-755 dark:text-zinc-350 transition text-[10px] font-extrabold cursor-pointer shadow-3xs border border-slate-200/50 dark:border-zinc-700/50 animate-pulse"
                title="View Speech Diagnostics Console Logs"
              >
                <Activity className="h-3 w-3" />
                <span>Diagnostics</span>
              </button>

              {/* Real-time Voice System Status */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all duration-350 shadow-3xs ${
                voiceSystemStatus === "active"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                  : voiceSystemStatus === "silence"
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                    : voiceSystemStatus === "network-warning"
                      ? "bg-indigo-500/10 text-[#5427e6] dark:text-indigo-400 border-indigo-500/20"
                      : voiceSystemStatus === "mic-error"
                        ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 animate-pulse"
                        : "bg-slate-500/10 text-slate-705 dark:text-slate-400 border-slate-500/10"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  voiceSystemStatus === "active"
                    ? "bg-emerald-505 animate-pulse"
                    : voiceSystemStatus === "silence"
                      ? "bg-amber-500 animate-pulse"
                      : voiceSystemStatus === "network-warning"
                        ? "bg-indigo-505 animate-bounce"
                        : voiceSystemStatus === "mic-error"
                          ? "bg-rose-500 animate-ping"
                          : "bg-slate-400"
                }`} />
                <span className="capitalize text-[9px] tracking-wide font-black">
                  {voiceSystemStatus === "active" && "Voice Stream Active"}
                  {voiceSystemStatus === "silence" && "Silence Detected"}
                  {voiceSystemStatus === "network-warning" && "Network Retrying..."}
                  {voiceSystemStatus === "mic-error" && "Microphone Blocked"}
                  {voiceSystemStatus === "paused" && "Stream Off/Paused"}
                </span>
              </div>
            </div>
            
            {/* Filler word metric tags */}
            <div className="flex gap-2 text-[10px] font-bold text-slate-500">
              <span className="px-2.5 py-1 rounded-lg bg-white/45 dark:bg-[#12101a]/30 border border-slate-200/50 dark:border-zinc-805/60 text-slate-650 dark:text-zinc-400">UMMs: <span className="text-gradient font-black">{fillerWords.um}</span></span>
              <span className="px-2.5 py-1 rounded-lg bg-white/45 dark:bg-[#12101a]/30 border border-slate-200/50 dark:border-zinc-805/60 text-slate-650 dark:text-zinc-400">LIKEs: <span className="text-gradient font-black">{fillerWords.like}</span></span>
              <span className="px-2.5 py-1 rounded-lg bg-white/45 dark:bg-[#12101a]/30 border border-slate-200/50 dark:border-zinc-805/60 text-slate-650 dark:text-zinc-400">YOU KNOWs: <span className="text-gradient font-black">{fillerWords.youknow}</span></span>
            </div>
          </div>

          {/* AI Tutor Portrait Display */}
          <div className="flex flex-col items-center justify-center mb-8 relative z-10">
            <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-full avatar-glow mb-4 flex items-center justify-center bg-[#13111c] border border-white/10 shadow-2xl">
              <img 
                alt="AI Coach" 
                className="w-full h-full object-cover rounded-full mix-blend-screen opacity-90" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCJYxnsWKx3UaU_FVhWy8-_Dm1YpHTeIumDYXmsxyRL7hqnpv0fvEQr1TqF-qGsvyCzUKUxDGT6KPCNXJ-iRLFpK6mCDG7efhLEvJYKN_mBJB_tglBMmeNvhi_uBCEX2mxGyHUIEfid87AhQVLE3hl7Cyc4vj-9w8qLB_IO084hVfy0jWEpslEeIq9iUNbYu7wQ05TiI7ZOnQ_0k_NNT5gfp8OUrc873kfkQiVGr3u0cZIP-AYJag51JYaHYLBa6N5TK36j3Ww2Hqb_"
                referrerPolicy="no-referrer"
              />
              <div className={`absolute inset-0 rounded-full border-2 border-[#5427e6]/35 transition-all duration-1000 ${isRecording ? "animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" : ""}`}></div>
            </div>
          </div>

          {/* Prompt banner */}
          <div className="mb-8 rounded-3xl border border-[#5427e6]/25 bg-gradient-to-r from-[#5427e6]/5 to-[#1351d3]/5 p-5">
            <span className="block text-[10px] uppercase font-black text-gradient tracking-wider mb-1">Your IELTS Task:</span>
            <h4 className="text-base font-extrabold text-slate-900 mb-2 leading-tight">{question.topic}</h4>
            <p className="text-xs text-slate-650 dark:text-zinc-400 italic">" {question.question} "</p>
          </div>

          {/* Microphone helper banner if blocked */}
          {micError && (
            <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/20 p-5 text-rose-950 shadow-xs flex gap-3.5 items-start">
              <ShieldAlert className="h-6 w-6 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-extrabold text-sm block text-rose-700 dark:text-rose-450">Microphone Access Error</span>
                <p className="font-semibold text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{micError}</p>
                <div className="pt-2">
                  <a 
                    href={window.location.href} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-indigo-650 hover:text-indigo-800 font-extrabold underline decoration-indigo-650"
                  >
                    <span>Open in a New Tab</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Network Connection/Backoff warning banner */}
          {networkError && (
            <div className="mb-8 rounded-2xl border border-amber-250 bg-amber-50/20 p-5 text-amber-950 shadow-xs flex gap-3.5 items-start">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1">
                <span className="font-extrabold text-sm block text-amber-700 dark:text-amber-450">Voice Stream Interruption Safeguard</span>
                <p className="font-semibold text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{networkError}</p>
              </div>
            </div>
          )}

          {/* No Speech Silence notification banner */}
          {isRecording && voiceSystemStatus === "silence" && (
            <div className="mb-8 rounded-2xl border border-indigo-200 bg-indigo-50/20 p-5 text-[#5427e6] dark:text-indigo-400 shadow-xs flex gap-3.5 items-start animate-in fade-in slide-in-from-top-3 duration-300">
              <VolumeX className="h-6 w-6 text-[#5427e6] dark:text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1 text-left">
                <span className="font-extrabold text-sm block text-indigo-900 dark:text-indigo-300">Absolute Quiet Detected</span>
                <p className="font-semibold text-xs leading-relaxed text-slate-605 dark:text-zinc-450">
                  We haven't heard your voice for a brief moment. Since you are speaking, make sure you are close to the microphone and speaking audibly so the AI engine can transcribe your response.
                </p>
              </div>
            </div>
          )}

          {/* Waves animation */}
          <div className="flex items-center justify-center gap-[3px] h-20 mb-8 sm:px-12 max-w-sm mx-auto">
            {waveHeights.map((h, wIdx) => (
              <div
                key={wIdx}
                style={{ height: `${h}px` }}
                className={`w-1 rounded-full transition-all duration-150 ${
                  isRecording 
                    ? "bg-gradient-to-t from-[#5427e6] to-[#1351d3] shadow-[0_0_8px_rgba(84,39,230,0.5)] animate-pulse" 
                    : isAiSpeaking 
                      ? "bg-gradient-to-t from-emerald-600 to-teal-400" 
                      : "bg-[#484556]/40"
                }`}
              ></div>
            ))}
          </div>

          {/* Transcript board */}
          <div className="rounded-2xl border border-slate-205/50 dark:border-zinc-800/80 bg-white/40 dark:bg-[#12101a]/30 p-6 min-h-32 mb-8">
            <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Live Speech Transcription:</span>
            <div className="text-sm leading-relaxed text-slate-800 dark:text-zinc-200 font-semibold">
              {transcript}
              {interimTranscript && <span className="text-slate-400 italic">{interimTranscript}</span>}
              {!transcript && !interimTranscript && (
                <span className="text-slate-450 dark:text-zinc-500 block text-xs font-semibold">Begin speaking your IELTS response clearly. Web transcription triggers in real-time.</span>
              )}
            </div>
          </div>

          {/* Recording Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 font-bold">
            <div className="flex items-center gap-2">
              {isRecording ? (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="p-4 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 border border-rose-200/50 dark:border-rose-900 rounded-2xl transition-all text-rose-600 dark:text-rose-450 cursor-pointer shadow-md"
                >
                  <Square className="h-5 w-5 fill-rose-600 text-rose-600" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleManualStartRecording}
                  className="p-4 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-900 rounded-2xl transition-all text-[#5427e6] dark:text-indigo-400 cursor-pointer shadow-md"
                >
                  <Mic className="h-5 w-5" />
                </button>
              )}

              {/* TTS repeat button */}
              <button
                type="button"
                onClick={() => handleTriggerSpeech(question.question)}
                title="Tutor Repeat Prompt"
                className="p-4 bg-white/50 dark:bg-zinc-900/40 hover:bg-white/75 border border-slate-200/50 dark:border-zinc-800 rounded-2xl transition-all text-slate-500 hover:text-[#5427e6] cursor-pointer shadow-md"
              >
                <Volume2 className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-5 py-3 rounded-xl border border-slate-205/50 dark:border-zinc-800 text-slate-500 hover:text-slate-800 dark:hover:text-white text-xs cursor-pointer transition-colors"
              >
                Back Out
              </button>
              <button
                onClick={handleEvaluateAnswers}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-650/15 hover:opacity-95"
              >
                <span>End Test & Evaluate</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionState === "evaluating" && (
        <div className="rounded-[2.5rem] border border-slate-200/50 dark:border-zinc-800/80 bg-white dark:bg-[#12101a] p-12 text-center shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#5427e6]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
          
          {!evalError ? (
            <div className="relative z-10 py-6">
              <Loader2 className="h-12 w-12 text-[#5427e6] dark:text-indigo-400 mx-auto animate-spin mb-6" />
              <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Analyzing Vocal Performance</h3>
              <p className="text-sm text-slate-500 font-bold max-w-md mx-auto leading-relaxed">
                Our elite examiner agents (Examiner + Analyst + Coach) are scoring speaking bands, counting filler pauses, and scanning grammatical accuracy...
              </p>
            </div>
          ) : (
            <div className="relative z-10 py-4 max-w-xl mx-auto text-left">
              <div className="flex items-center gap-4 mb-6 pb-4 border-b border-rose-100 dark:border-rose-950/30">
                <div className="h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center shrink-0">
                  <ShieldAlert className="h-6 w-6 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-rose-700 dark:text-rose-400">AI Engine High Demand</h3>
                  <p className="text-xs text-slate-450 dark:text-zinc-400 font-bold">Temporary capacity spike detected</p>
                </div>
              </div>
              
              <div className="p-5 rounded-2xl bg-rose-50/20 border border-rose-200/50 text-slate-650 dark:text-zinc-300 text-xs leading-relaxed font-semibold mb-8">
                <span className="block font-black text-rose-600 dark:text-rose-450 mb-1">Response Diagnostic Message:</span>
                "{evalError}"
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-end font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setEvalError(null);
                    setSessionState("speaking");
                  }}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-205/50 dark:border-zinc-805/60 text-slate-550 dark:text-zinc-350 hover:text-slate-800 dark:hover:text-white text-xs cursor-pointer text-center"
                >
                  Go Back & Refine Speech
                </button>
                <button
                  type="button"
                  onClick={handleEvaluateAnswers}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/10 hover:opacity-95"
                >
                  <RefreshCw className="h-4 w-4 animate-spin-slow" />
                  <span>Retry Band Evaluation</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}      {sessionState === "feedback" && evaluationResult && (
        <div className="space-y-8 animate-fade-in">
          
          {/* Main big score banner */}
          <div className="relative overflow-hidden rounded-3xl border border-indigo-150 bg-indigo-50/50 p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">Evaluation Report</span>
                <h3 className="text-2xl font-black text-indigo-950 mt-2 leading-tight">IELTS Dynamic Band Prediction</h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed max-w-xl font-medium">
                  {evaluationResult.examinerCommentary || "Your response displayed stable flow with minor syntax shifts near transitions."}
                </p>
              </div>

              {/* Band Circle */}
              <div className="flex flex-col items-center justify-center h-32 w-32 rounded-full border-4 border-indigo-150 bg-white shrink-0 relative shadow-xs">
                <span className="text-4xl font-black text-indigo-650">{(evaluationResult.overallBand || 6.5).toFixed(1)}</span>
                <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest">Estimated</span>
              </div>
            </div>
          </div>

          {/* Breakdown cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Fluency & Coherence</span>
              <strong className="text-2xl font-black text-indigo-950 mt-1 block">{(evaluationResult.fluencyBand || 6.5).toFixed(1)}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Lexical Resource</span>
              <strong className="text-2xl font-black text-indigo-950 mt-1 block">{(evaluationResult.vocabularyBand || 6.5).toFixed(1)}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Grammar Accuracy</span>
              <strong className="text-2xl font-black text-indigo-950 mt-1 block">{(evaluationResult.grammarBand || 6.5).toFixed(1)}</strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Pronunciation Voice</span>
              <strong className="text-2xl font-black text-indigo-950 mt-1 block">{(evaluationResult.pronunciationBand || 6.5).toFixed(1)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Strengths / Weaknesses */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6 shadow-xs">
              <div>
                <span className="text-xs uppercase tracking-widest font-extrabold text-emerald-600 mb-3 block">What You Did Well</span>
                <ul className="text-xs text-slate-600 space-y-3.5 pl-1.5">
                  {(evaluationResult.strengths || ["Grammatically stable simple structures", "Great pacing"]).map((str: string, sIdx: number) => (
                    <li key={sIdx} className="flex items-start gap-2.5 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-505 shrink-0 mt-0.5" />
                      <span>{str}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="text-xs uppercase tracking-widest font-extrabold text-amber-600 mb-3 block">Weaknesses Identified</span>
                <ul className="text-xs text-slate-600 space-y-3.5 pl-1.5">
                  {(evaluationResult.weaknesses || ["Vocabulary repetition near topic nouns", "Vocal breaks"]).map((weak: string, wIdx: number) => (
                    <li key={wIdx} className="flex items-start gap-2.5 font-medium">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <span>{weak}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Grammar & Vocab Corrections */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <span className="text-xs uppercase tracking-widest font-extrabold text-rose-600 mb-4 block">Grammatical Corrections</span>
              
              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {(evaluationResult.corrections && evaluationResult.corrections.length > 0) ? (
                  evaluationResult.corrections.map((corr: SpeakingCorrection, cIdx: number) => (
                    <div key={cIdx} className="rounded-xl border border-slate-150 bg-slate-50 p-4 space-y-2 text-xs leading-relaxed">
                      <div className="text-rose-600 font-extrabold"><strong className="font-extrabold">Original:</strong> "{corr.original}"</div>
                      <div className="text-emerald-700 font-extrabold"><strong className="font-extrabold">Suggested:</strong> "{corr.correction}"</div>
                      <div className="text-slate-500 border-t border-slate-200 pt-2 mt-2 font-medium">{corr.explanation}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-450 font-semibold">Perfect grammar range! No massive flaws extracted from transcript.</div>
                )}
              </div>
            </div>
          </div>

          {/* Actions Plan & Coaching */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-xs">
            <h3 className="text-lg font-bold text-indigo-950 mb-2 flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-indigo-600 animate-pulse" />
              Baddie Buddy Personalized Practice Action Plan
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed font-semibold">
              {evaluationResult.coachFeedback || "Awesome hustle today! Ready to make some steps forward? Try speaking using these parameters:"}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(evaluationResult.actionPlan || [
                "Practice travel cards", 
                "Incorporate transition words", 
                "Focus on TH relative clause structures"
              ]).map((act: string, aIdx: number) => (
                <div key={aIdx} className="rounded-xl bg-indigo-50/50 p-4 border border-indigo-100/50 flex gap-3 text-xs leading-relaxed">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 font-bold shrink-0">
                    {aIdx + 1}
                  </span>
                  <span className="text-slate-600 font-semibold">{act}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Pronunciation & Speech Clarity Audit Panel */}
          {evaluationResult.pronunciationDetails && (
            <div className="rounded-3xl border border-indigo-150 bg-indigo-50/20 p-6 md:p-8 shadow-xs space-y-6">
              <div className="flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-indigo-600" />
                <h4 className="text-lg font-black text-indigo-950">AI Pronunciation & Speech Clarity Audit</h4>
              </div>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Evaluating phonetic clarity, word-level accentual rhythm, and speech cadence according to official IELTS pronunciation band criteria.
              </p>

              {/* Individual metric bars */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2 bg-white rounded-2xl p-4 border border-slate-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Pitch & Intonation</span>
                    <span className="text-indigo-600 font-extrabold bg-indigo-50 px-2 py-0.5 rounded text-[10px]">
                      {(evaluationResult.pronunciationDetails.intonationScore || 6.5).toFixed(1)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 rounded-full" 
                      style={{ width: `${((evaluationResult.pronunciationDetails.intonationScore || 6.5) / 9) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="space-y-2 bg-white rounded-2xl p-4 border border-slate-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Rhythm & Word Stress</span>
                    <span className="text-indigo-600 font-extrabold bg-indigo-50 px-2 py-0.5 rounded text-[10px]">
                      {(evaluationResult.pronunciationDetails.stressScore || 6.5).toFixed(1)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 rounded-full" 
                      style={{ width: `${((evaluationResult.pronunciationDetails.stressScore || 6.5) / 9) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="space-y-2 bg-white rounded-2xl p-4 border border-slate-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Sound Clarity & Phonemes</span>
                    <span className="text-indigo-600 font-extrabold bg-indigo-50 px-2 py-0.5 rounded text-[10px]">
                      {(evaluationResult.pronunciationDetails.clarityScore || 6.5).toFixed(1)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 rounded-full" 
                      style={{ width: `${((evaluationResult.pronunciationDetails.clarityScore || 6.5) / 9) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Detected gaps & drills */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-rose-100 bg-rose-50/20 p-5 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 uppercase tracking-wider">
                    <AlertTriangle className="h-4 w-4" />
                    Detected Sound Gaps (Phonetics)
                  </div>
                  <ul className="text-xs text-slate-600 space-y-2 pl-1 font-semibold leading-relaxed">
                    {(evaluationResult.pronunciationDetails.phonemeErrors || []).map((err: string, eIdx: number) => (
                      <li key={eIdx} className="flex gap-1.5 items-start">
                        <span className="text-rose-500 shrink-0 select-none font-bold">•</span>
                        <span>{err}</span>
                      </li>
                    ))}
                    {(!evaluationResult.pronunciationDetails.phonemeErrors || evaluationResult.pronunciationDetails.phonemeErrors.length === 0) && (
                      <li className="text-slate-400">Stable, standard vowels and consonants detected!</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/20 p-5 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 uppercase tracking-wider animate-pulse">
                    <Sparkles className="h-4 w-4" />
                    Targeted Speech Drills
                  </div>
                  <ul className="text-xs text-slate-600 space-y-2.5 pl-1 font-semibold leading-relaxed">
                    {(evaluationResult.pronunciationDetails.targetedExercises || []).map((ex: string, exIdx: number) => (
                      <li key={exIdx} className="bg-white border border-emerald-50 p-2.5 rounded-xl font-mono text-[10.5px] text-emerald-700 shadow-3xs">
                        {ex}
                      </li>
                    ))}
                    {(!evaluationResult.pronunciationDetails.targetedExercises || evaluationResult.pronunciationDetails.targetedExercises.length === 0) && (
                      <li className="text-slate-400">Keep up your fluent and standard pacing!</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="text-xs text-indigo-900 bg-indigo-50/60 rounded-2xl p-4 border border-indigo-100/50 font-semibold italic">
                Comment: "{evaluationResult.pronunciationDetails.overallFeedback}"
              </div>
            </div>
          )}

          {/* Back / Next Trigger */}
          <div className="flex justify-between items-center pt-4 border-t border-slate-100 mt-4">
            {questionsPlaylist && questionsPlaylist.length > 0 ? (
              <>
                <span className="text-xs text-slate-500 font-semibold bg-slate-100 rounded-lg px-3 py-1.5 select-none">
                  Completed Step {playlistIndex + 1} of {questionsPlaylist.length}
                </span>

                {playlistIndex < questionsPlaylist.length - 1 ? (
                  <button
                    onClick={() => {
                      setPlaylistIndex(prev => prev + 1);
                      setSessionState("setup");
                      setTranscript("");
                      setInterimTranscript("");
                      setFillerWords({ um: 0, uh: 0, like: 0, youknow: 0 });
                      setEvaluationResult(null);
                      if (window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                      }
                    }}
                    className="px-6 py-3 rounded-xl bg-indigo-650 hover:bg-indigo-700 font-extrabold text-white text-xs cursor-pointer shadow-md shadow-indigo-600/10 flex items-center gap-1.5"
                  >
                    <span>Proceed to Part {questionsPlaylist[playlistIndex + 1].partType}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onFinishSession();
                    }}
                    className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 font-extrabold text-white text-xs cursor-pointer shadow-md shadow-purple-600/10"
                  >
                    Finish Full Tailored Session
                  </button>
                )}
              </>
            ) : (
              <div className="w-full flex justify-end">
                <button
                  onClick={() => {
                    onFinishSession();
                  }}
                  className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-extrabold text-white text-xs cursor-pointer shadow-md shadow-indigo-600/10"
                >
                  Complete Practice Session
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Centralized System Status Alert Toast */}
      {activeToast && (
        <div 
          onClick={() => setActiveToast(null)}
          className={`fixed bottom-6 right-6 z-55 flex items-start gap-3.5 p-4 rounded-2xl border shadow-lg max-w-sm w-full animate-in slide-in-from-bottom-5 duration-300 transition-all cursor-pointer backdrop-blur-md ${
            activeToast.type === "success" 
              ? "bg-emerald-50/95 border-emerald-250 text-emerald-950" 
              : activeToast.type === "error"
                ? "bg-rose-50/95 border-rose-250 text-rose-950"
                : activeToast.type === "warning"
                  ? "bg-amber-50/95 border-amber-250 text-amber-950"
                  : "bg-slate-50/95 border-slate-250 text-indigo-950"
          }`}
        >
          {activeToast.type === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />}
          {activeToast.type === "error" && <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />}
          {activeToast.type === "warning" && <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />}
          {activeToast.type === "info" && <Info className="h-5 w-5 text-indigo-505 shrink-0 mt-0.5" />}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="font-extrabold text-[10px] uppercase tracking-wider block text-indigo-950/70">
                {activeToast.category === "connection" && "Network Connection"}
                {activeToast.category === "audio-capture" && "Audio Capture Input"}
                {activeToast.category === "permission" && "Device Permissions"}
                {activeToast.category === "silence" && "Auditory Alert"}
                {activeToast.category === "recognition" && "System Status"}
              </span>
              <span className="text-[8px] font-mono opacity-60 shrink-0">{activeToast.timestamp}</span>
            </div>
            <p className="text-xs font-bold mt-1 leading-relaxed">{activeToast.message}</p>
          </div>
          
          <button className="text-slate-400 hover:text-slate-600 shrink-0 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Centralized System Status Diagnostic Drawer Slider */}
      {showLogsDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Activity className="h-5 w-5 text-indigo-600" />
                <div>
                  <h4 className="font-black text-indigo-955 text-sm">System Diagnostics Console</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Voice Recognition & Streams</p>
                </div>
              </div>
              <button 
                onClick={() => setShowLogsDrawer(false)}
                className="p-2 rounded-xl hover:bg-slate-50 text-slate-450 hover:text-slate-650 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Logs Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-3.5 bg-slate-50/50">
              {sessionLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Activity className="h-8 w-8 mx-auto mb-3 opacity-40 animate-pulse" />
                  <p className="text-xs font-bold">No auditory sessions recorded yet.</p>
                </div>
              ) : (
                [...sessionLogs].reverse().map((log) => (
                  <div 
                    key={log.id} 
                    className={`p-3.5 rounded-xl border bg-white shadow-3xs flex items-start gap-3 transition-colors ${
                      log.type === "error" 
                        ? "border-rose-100 bg-rose-50/10" 
                        : log.type === "warning"
                          ? "border-amber-100 bg-amber-50/10"
                          : log.type === "success"
                            ? "border-emerald-100 bg-emerald-50/10"
                            : "border-slate-100"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {log.type === "error" && <ShieldAlert className="h-4 w-4 text-rose-500" />}
                      {log.type === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      {log.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-505" />}
                      {log.type === "info" && <Info className="h-4 w-4 text-indigo-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
                        <span className="uppercase tracking-wider text-slate-500">{log.category}</span>
                        <span>{log.timestamp}</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-normal font-semibold break-words">{log.message}</p>
                      {log.errorCode && (
                        <span className="inline-block mt-1.5 px-2 py-0.5 bg-slate-105 text-slate-505 rounded font-mono text-[9px]">
                          Code: {log.errorCode}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Actions footer */}
            <div className="p-4 border-t border-slate-150 flex gap-3">
              <button
                onClick={() => speechLogger.clear()}
                className="w-full py-2.5 rounded-xl border border-slate-205 text-slate-505 font-bold text-xs hover:bg-slate-50 transition cursor-pointer"
              >
                Clear Console
              </button>
              <button
                onClick={() => setShowLogsDrawer(false)}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-extrabold text-xs hover:bg-indigo-705 shadow-md shadow-indigo-650/10 transition cursor-pointer"
              >
                Close Console
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
