import React, { useState, useEffect } from "react";
import { UserProfile, SpeakingSessionResult, PracticeQuestion } from "../types";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { kiranQuestionsList } from "../data/kiranQuestions";
import {
  Trophy, BookOpen, Clock, TrendingUp, Cpu, Award, Target,
  Calendar, ArrowUpRight, ChevronRight, FileText, Upload, CheckCircle2,
  Lock, AlertTriangle, Flame, Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import StreakConfetti from "./StreakConfetti";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";

interface DashboardProps {
  userProfile: UserProfile | null;
  practiceHistory: SpeakingSessionResult[];
  availableQuestions: PracticeQuestion[];
  onStartPracticeQuestion: (q: PracticeQuestion) => void;
  onStartPracticePlaylist?: (questions: PracticeQuestion[]) => void;
  onRefreshProfileAndQuestions: () => void;
  activeTab: "overview" | "questions" | "analytics" | "adaptive" | "admin";
  setActiveTab: (tab: "overview" | "questions" | "analytics" | "adaptive" | "admin") => void;
}

export default function Dashboard({
  userProfile,
  practiceHistory,
  availableQuestions,
  onStartPracticeQuestion,
  onStartPracticePlaylist,
  onRefreshProfileAndQuestions,
  activeTab,
  setActiveTab
}: DashboardProps) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [selectedPart, setSelectedPart] = useState<string>("all");

  // Streak & Gamification State Tracking
  const [localStreak, setLocalStreak] = useState<number>(() => {
    const saved = localStorage.getItem("baddie_local_streak");
    if (saved) return parseInt(saved, 10);
    return userProfile?.streak || 3;
  });

  const [streakClaimed, setStreakClaimed] = useState<boolean>(() => {
    const today = new Date().toISOString().split("T")[0];
    const savedDate = localStorage.getItem("baddie_last_claim_date");
    return savedDate === today;
  });

  const [triggerConfetti, setTriggerConfetti] = useState(false);
  const [streakXpBonus, setStreakXpBonus] = useState(false);

  // Sync state if user profile changes from server
  useEffect(() => {
    if (userProfile?.streak !== undefined && userProfile?.streak !== null) {
      if (userProfile.streak > localStreak) {
        setTriggerConfetti(true);
        setStreakXpBonus(true);
        const timer = setTimeout(() => {
          setStreakXpBonus(false);
        }, 4000);
        return () => clearTimeout(timer);
      }
      setLocalStreak(userProfile.streak);
    }
  }, [userProfile?.streak]);

  const handleClaimStreak = async () => {
    const newStreak = localStreak + 1;
    setLocalStreak(newStreak);
    localStorage.setItem("baddie_local_streak", newStreak.toString());
    const todayStr = new Date().toISOString().split("T")[0];
    localStorage.setItem("baddie_last_claim_date", todayStr);
    setStreakClaimed(true);

    // Blast celebratory confetti via state trigger
    setTriggerConfetti(true);
    setStreakXpBonus(true);
    setTimeout(() => {
      setStreakXpBonus(false);
    }, 4000);

    // Persist to Firestore if user profile exists
    if (userProfile && db) {
      const profileRef = doc(db, "users", userProfile.uid);
      try {
        await updateDoc(profileRef, {
          streak: newStreak,
          xp: (userProfile.xp || 150) + 50,
          lastPracticeDate: todayStr
        });
        if (onRefreshProfileAndQuestions) {
          onRefreshProfileAndQuestions();
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${userProfile.uid}`);
      }
    }
  };

  // Admin states
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [pastedText, setPastedText] = useState("");

  const actualHistory = practiceHistory && practiceHistory.length > 0 ? practiceHistory : [
    {
      id: "demo1",
      topic: "Language Learning",
      promptQuestion: "Do you enjoy learning new languages?",
      overallBand: 6.0,
      fluencyBand: 6.5,
      vocabularyBand: 6.0,
      grammarBand: 5.5,
      pronunciationBand: 6.0,
      createdAt: "2026-06-10",
      sessionType: "practice"
    },
    {
      id: "demo2",
      topic: "Describe a city you visited",
      promptQuestion: "Describe a beautiful city you visited.",
      overallBand: 6.5,
      fluencyBand: 6.5,
      vocabularyBand: 7.0,
      grammarBand: 6.0,
      pronunciationBand: 6.5,
      createdAt: "2026-06-12",
      sessionType: "mock_test"
    },
    {
      id: "demo3",
      topic: "Technology Problems",
      promptQuestion: "Describe a challenging technological problem.",
      overallBand: 7.0,
      fluencyBand: 7.0,
      vocabularyBand: 7.5,
      grammarBand: 6.5,
      pronunciationBand: 7.0,
      createdAt: "2026-06-15",
      sessionType: "practice"
    }
  ] as SpeakingSessionResult[];

  // Helper to compute adaptive learning path
  const analyzeWeaknessAndSelectQuestions = () => {
    let focusArea = "All-Round IELTS Fluency & Phonetic Balance";
    let weaknessReason = "This diagnostic program is designed to baseline your current level across Part 1, 2, and 3 topics prior to intensive training.";
    let lowestMetric = "general";

    const actualHist = practiceHistory && practiceHistory.length > 0 ? practiceHistory : [];
    if (actualHist.length > 0) {
      let totalFluency = 0;
      let totalLexical = 0;
      let totalGrammar = 0;
      let totalPronunciation = 0;
      const count = actualHist.length;

      actualHist.forEach(s => {
        totalFluency += s.fluencyBand || 6.0;
        totalLexical += s.vocabularyBand || 6.0;
        totalGrammar += s.grammarBand || 6.0;
        totalPronunciation += s.pronunciationBand || 6.0;
      });

      const avgFluency = totalFluency / count;
      const avgLexical = totalLexical / count;
      const avgGrammar = totalGrammar / count;
      const avgPronunciation = totalPronunciation / count;

      const scores = [
        { metric: "fluency", val: avgFluency, name: "Fluency & Coherence" },
        { metric: "lexical", val: avgLexical, name: "Lexical Resource (Vocabulary)" },
        { metric: "grammar", val: avgGrammar, name: "Grammar Accuracy & Range" },
        { metric: "pronunciation", val: avgPronunciation, name: "Speech Clarity & Pronunciation" },
      ];

      scores.sort((a, b) => a.val - b.val);
      const weakest = scores[0];
      lowestMetric = weakest.metric;

      if (weakest.metric === "grammar") {
        focusArea = "Grammatically Coherent Complex Structures";
        weaknessReason = `Based on your average grammar score of ${weakest.val.toFixed(1)}, you often show tense shifts or struggle with complex modal nesting. This session targets past narrative and hypothetical structures.`;
      } else if (weakest.metric === "lexical") {
        focusArea = "Lexical Enrichment & Idiom Integration";
        weaknessReason = `Your average vocabulary score is ${weakest.val.toFixed(1)}, showing occasional repetitions. This session forces descriptive adjectives and idiomatic structures.`;
      } else if (weakest.metric === "pronunciation") {
        focusArea = "Speech Cadence, Stress & Consonant Precision";
        weaknessReason = `With an average pronunciation score of ${weakest.val.toFixed(1)}, syllable stressing or fricative clarity is the key gap. This session is selected with high vocal contrasts.`;
      } else {
        focusArea = "Coalesced Speech Pacing & Transition Usage";
        weaknessReason = `Based on your fluency score of ${weakest.val.toFixed(1)}, occasional pauses near transitions are flagged. This session requires logical linkers.`;
      }
    }

    const part1Questions = availableQuestions.filter(q => q.partType === 1);
    const part2Questions = availableQuestions.filter(q => q.partType === 2);
    const part3Questions = availableQuestions.filter(q => q.partType === 3);

    const defaultPart1: PracticeQuestion = part1Questions[0] || {
      id: "p1-default",
      topic: "Language Studies",
      question: "Are you learning any other foreign languages?",
      partType: 1,
      difficulty: "medium",
      category: "Education",
      keywords: ["language", "study"]
    };

    const defaultPart2: PracticeQuestion = part2Questions[0] || {
      id: "p2-default",
      topic: "Describe school project",
      question: "Describe a memorable school project you completed.",
      partType: 2,
      difficulty: "medium",
      category: "Education",
      keywords: ["project", "describe"],
      cueCardSubQuestions: ["What it was", "When you worked on it", "Explain how you felt about it"]
    };

    const defaultPart3: PracticeQuestion = part3Questions[0] || {
      id: "p3-default",
      topic: "Educational Changes",
      question: "How has teaching changed in your country over the last decade?",
      partType: 3,
      difficulty: "hard",
      category: "Education",
      keywords: ["teaching", "education"]
    };

    let p1 = defaultPart1;
    let p2 = defaultPart2;
    let p3 = defaultPart3;

    if (lowestMetric === "grammar") {
      p1 = part1Questions.find(q => q.keywords?.some(k => ["history", "past", "childhood", "hometown"].includes(k.toLowerCase()))) || part1Questions[0] || defaultPart1;
      p2 = part2Questions.find(q => q.keywords?.some(k => ["visited", "old", "lost", "happened", "journey"].includes(k.toLowerCase()))) || part2Questions[0] || defaultPart2;
      p3 = part3Questions.find(q => q.keywords?.some(k => ["future", "predict", "change", "society"].includes(k.toLowerCase()))) || part3Questions[0] || defaultPart3;
    } else if (lowestMetric === "lexical") {
      p1 = part1Questions.find(q => q.keywords?.some(k => ["nature", "art", "music", "fashion", "hobbies"].includes(k.toLowerCase()))) || part1Questions[1] || defaultPart1;
      p2 = part2Questions.find(q => q.keywords?.some(k => ["describe", "beautiful", "interesting", "gift", "book"].includes(k.toLowerCase()))) || part2Questions[1] || defaultPart2;
      p3 = part3Questions.find(q => q.keywords?.some(k => ["influence", "society", "global", "economics"].includes(k.toLowerCase()))) || part3Questions[1] || defaultPart3;
    } else if (lowestMetric === "pronunciation") {
      p1 = part1Questions.find(q => q.keywords?.some(k => ["work", "weather", "home", "study"].includes(k.toLowerCase()))) || part1Questions[2] || defaultPart1;
      p2 = part2Questions.find(q => q.keywords?.some(k => ["challenge", "sport", "activism", "health"].includes(k.toLowerCase()))) || part2Questions[2] || defaultPart2;
      p3 = part3Questions.find(q => q.keywords?.some(k => ["debate", "opinion", "importance"].includes(k.toLowerCase()))) || part3Questions[2] || defaultPart3;
    } else {
      p1 = part1Questions.find(q => q.keywords?.some(k => ["free", "leisure", "social", "friend"].includes(k.toLowerCase()))) || part1Questions[2] || defaultPart1;
      p2 = part2Questions.find(q => q.keywords?.some(k => ["party", "event", "celebration", "meal"].includes(k.toLowerCase()))) || part2Questions[0] || defaultPart2;
      p3 = part3Questions.find(q => q.keywords?.some(k => ["impact", "development", "role"].includes(k.toLowerCase()))) || part3Questions[0] || defaultPart3;
    }

    return {
      focusArea,
      weaknessReason,
      playlist: [p1, p2, p3]
    };
  };

  const adaptivePlan = analyzeWeaknessAndSelectQuestions();

  // Charts formatting
  const chartData = actualHistory.slice(-6).map((session) => ({
    name: session.createdAt.substring(5, 10) || "Today",
    "Overall Band": session.overallBand,
    "Fluency": session.fluencyBand,
    "Vocabulary": session.vocabularyBand,
    "Grammar": session.grammarBand,
    "Pronunciation": session.pronunciationBand,
  }));

  const latestSession = actualHistory[actualHistory.length - 1];

  const radarData = [
    { subject: "Fluency", value: latestSession?.fluencyBand || 6.5 },
    { subject: "Vocabulary", value: latestSession?.vocabularyBand || 7.0 },
    { subject: "Grammar", value: latestSession?.grammarBand || 6.0 },
    { subject: "Pronunciation", value: latestSession?.pronunciationBand || 6.5 },
  ];

  // Daily Tasks - adaptation based on weaknesses
  const dailyTasks = [
    { day: "Monday", title: "Practice travel cue-cards & advanced transitions", done: false },
    { day: "Tuesday", title: "Study relative clauses & past-tense coherence", done: true },
    { day: "Wednesday", title: "Analyze vocabulary for abstract Part 3 answers", done: false },
    { day: "Thursday", title: "Complete full 3-part mocks with Examiner Agent", done: false },
    { day: "Friday", title: "Work on TH sounds pronunciation challenge", done: false }
  ];

  // Achievements
  const achievements = [
    { id: "ach1", title: "First Speaking Step", desc: "Completed your first voice practice session.", unlocked: true, xp: 50 },
    { id: "ach2", title: "Band 7.0 Achiever", desc: "Obtain a score of 7.0+ on any feedback evaluation.", unlocked: latestSession?.overallBand >= 7.0, xp: 150 },
    { id: "ach3", title: "Pronunciation Master", desc: "Achieve native stress scores of 7.5+ in Pronunciation.", unlocked: latestSession?.pronunciationBand >= 7.5, xp: 200 },
    { id: "ach4", title: "7-Day Streak Warrior", desc: "Practice consistently for 7 straight calendar days.", unlocked: (userProfile?.streak || 0) >= 7, xp: 300 },
  ];

  // Filter Questions
  const filteredQuestions = availableQuestions.filter((q) => {
    const diffMatch = selectedDifficulty === "all" || q.difficulty === selectedDifficulty;
    const partMatch = selectedPart === "all" || q.partType.toString() === selectedPart;
    return diffMatch && partMatch;
  });

  // Admin Custom PDF Parsing Extraction simulation
  const handleSimulatedPdfExtraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;

    setIsExtracting(true);
    setUploadMessage("");

    try {
      const response = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "Kiran Makkar Speaking Guesswork May-Aug 2026.txt",
          rawText: pastedText
        })
      });

      if (!response.ok) {
        throw new Error("Backend extraction error.");
      }

      const data = await response.json();
      if (data.questions && data.questions.length > 0) {
        // Save to Firestore if user profile available
        if (userProfile && db) {
          for (const q of data.questions) {
            try {
              await addDoc(collection(db, "pdfQuestions"), {
                topic: q.topic,
                partType: q.partType,
                question: q.question,
                cueCardSubQuestions: q.cueCardSubQuestions || [],
                difficulty: q.difficulty,
                category: q.category,
                keywords: q.keywords || [],
                isCustomExtracted: true
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, "pdfQuestions");
            }
          }
        }
        setUploadMessage(`Successfully extracted & injected ${data.questions.length} new expert questions from Kiran Makkar PDF!`);
        setPastedText("");
        onRefreshProfileAndQuestions();
      } else {
        setUploadMessage("Failed to extract questions. Please check text patterns.");
      }
    } catch (err: any) {
      console.error(err);
      setUploadMessage("Simulation error: " + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // Helper to load standard initial set to database if empty
  const handleLoadSampleDatabase = async () => {
    if (!userProfile) return;
    setUploadMessage("Injecting preloaded bank...");
    try {
      for (const q of kiranQuestionsList) {
        try {
          await addDoc(collection(db, "pdfQuestions"), q);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, "pdfQuestions");
        }
      }
      setUploadMessage("Preloaded IELTS Speaking bank successfully configured!");
      onRefreshProfileAndQuestions();
    } catch (err: any) {
      setUploadMessage("Error loading database: " + err.message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 relative">
      {/* Centralized Framer-Motion Milestone Confetti Cannon */}
      <StreakConfetti active={triggerConfetti} onComplete={() => setTriggerConfetti(false)} />
      
      {/* Visual Header */}
      <div className="relative mb-8 overflow-hidden rounded-[2rem] p-6 md:p-8 shadow-xs glass-panel animate-in fade-in duration-500">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#5427e6]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6 z-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 mb-2">
              Welcome back, <span className="text-gradient font-black">{userProfile?.name || "IELTS Learner"}</span>! 👋
            </h1>
            <p className="text-slate-500 max-w-2xl text-sm leading-relaxed font-semibold">
              Achieve your Band 7.5+ goal with Baddie Buddy. Today we recommend practicing 
              <span className="text-indigo-650 font-bold bg-[#5427e6]/5 dark:bg-[#5427e6]/20 px-1.5 py-0.5 rounded-full ml-1 text-gradient border border-indigo-150/50"> "describe a long-term goal"</span> to reinforce advanced lexical structures.
            </p>
          </div>
          <div className="flex h-14 items-center gap-4 rounded-2xl bg-white/40 dark:bg-[#12101a]/40 border border-slate-200/50 dark:border-zinc-800/80 p-4">
            <TrendingUp className="h-6 w-6 text-emerald-500" />
            <div>
              <span className="text-xs text-slate-400 block uppercase font-bold tracking-wider">Estimated Band</span>
              <strong className="text-xl font-black text-slate-900">Band {userProfile?.currentBand || "6.5"}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Concept & Core Strategy Guide */}
      {activeTab === "overview" && (
        <div className="mb-10 rounded-[2rem] p-6 md:p-8 shadow-xs relative overflow-hidden glass-panel">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#1351d3]/5 rounded-full blur-3xl -z-10"></div>
          <div className="max-w-5xl relative z-10 text-on-surface">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#5427e6] dark:text-indigo-300 border border-indigo-150/45 dark:border-indigo-900/40 bg-[#5427e6]/5 dark:bg-[#5427e6]/20 px-2.5 py-1 rounded-full mb-3 inline-block">
              ✨ About Baddie Buddy
            </span>
            <h3 className="text-2xl md:text-3xl font-black text-gradient tracking-tight mb-4">
              Your Complete AI-Powered IELTS Speaking Companion
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed font-semibold mb-6">
              Baddie Buddy is a fully conversational, state-of-the-art IELTS Coach that replicates the physical speaking environment of IDP & British Council examinations. By blending optimized Web Speech tools, interactive audio waves, and the incredible reasoning power of modern LLM scoring models, Baddie Buddy listens to your natural voice stream, detects lexical filler words, and generates an official rubric-based grade report instantly.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200/40 bg-white/30 dark:bg-[#12101a]/30 p-5 hover:border-indigo-150 hover:bg-[#5427e6]/5 hover:shadow-xs transition-all flex flex-col justify-between">
                <div>
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#5427e6]/10 text-[#5427e6] dark:text-indigo-300 font-extrabold text-sm mb-3">
                    01
                  </span>
                  <h4 className="font-extrabold text-slate-900 text-sm mb-1">Select standard mock topic</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                    Navigate to the <strong className="text-[#5427e6]">Speaking Bank</strong> using the top bar to practice official Part 1, Part 2 cue cards, and Part 3 prompt flows.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/40 bg-white/30 dark:bg-[#12101a]/30 p-5 hover:border-indigo-150 hover:bg-[#5427e6]/5 hover:shadow-xs transition-all flex flex-col justify-between">
                <div>
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#5427e6]/10 text-[#5427e6] dark:text-indigo-300 font-extrabold text-sm mb-3">
                    02
                  </span>
                  <h4 className="font-extrabold text-slate-900 text-sm mb-1">Speak into optimized mic</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                    The voice recorder is enhanced with connection keep-alive and audio pooling to let you speak continuously without normal quiet pauses cutting you off.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5 hover:border-indigo-150 hover:bg-indigo-50/10 hover:shadow-xs transition-all flex flex-col justify-between">
                <div>
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 font-extrabold text-sm mb-3">
                    03
                  </span>
                  <h4 className="font-extrabold text-indigo-950 text-sm mb-1">Monitor speech fillers</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                    Our analyzer tracks natural crutch phrases (like "um", "uh", "like", "you know") as you practice to help you speak with higher fluency and cohesion.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5 hover:border-indigo-150 hover:bg-indigo-50/10 hover:shadow-xs transition-all flex flex-col justify-between">
                <div>
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 font-extrabold text-sm mb-3">
                    04
                  </span>
                  <h4 className="font-extrabold text-indigo-950 text-sm mb-1">Get precise IELTS grading</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                    Get an immediate comprehensive estimated Band Score alongside direct, thorough feedback mapped to Fluency, Vocabulary, Grammar, and Pronunciation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TABS CONTAINER */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main left content */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-3xl border border-slate-200/50 bg-[#fdf8ff]/40 dark:bg-[#1a1726]/40 backdrop-blur-2xl p-5 shadow-xs glass-panel hover:scale-[1.02] transition-all">
                <Target className="h-5 w-5 text-[#5427e6] dark:text-indigo-400 mb-3" />
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-550 block uppercase tracking-wider">Target Score</span>
                <strong className="text-2xl font-black text-gradient">Band {userProfile?.targetBand || "7.5"}</strong>
              </div>
              <div className="rounded-3xl border border-slate-200/50 bg-[#fdf8ff]/40 dark:bg-[#1a1726]/40 backdrop-blur-2xl p-5 shadow-xs glass-panel hover:scale-[1.02] transition-all">
                <Trophy className="h-5 w-5 text-amber-500 mb-3" />
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-550 block uppercase tracking-wider">Current Score</span>
                <strong className="text-2xl font-black text-[#1351d3] dark:text-indigo-300">Band {userProfile?.currentBand || "6.0"}</strong>
              </div>
              <div className="rounded-3xl border border-slate-200/50 bg-[#fdf8ff]/40 dark:bg-[#1a1726]/40 backdrop-blur-2xl p-5 shadow-xs glass-panel hover:scale-[1.02] transition-all">
                <Clock className="h-5 w-5 text-sky-500 mb-3" />
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-550 block uppercase tracking-wider">Total Practice</span>
                <strong className="text-2xl font-black text-[#5427e6] dark:text-indigo-400">{userProfile?.totalHours?.toFixed(1) || "1.2"}h</strong>
              </div>
              <div className="rounded-3xl border border-slate-200/50 bg-[#fdf8ff]/40 dark:bg-[#1a1726]/40 backdrop-blur-2xl p-5 shadow-xs glass-panel hover:scale-[1.02] transition-all">
                <BookOpen className="h-5 w-5 text-rose-500 mb-3" />
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-550 block uppercase tracking-wider">Mocks Taken</span>
                <strong className="text-2xl font-black text-slate-800 dark:text-white">{userProfile?.sessionsCompleted || 0}</strong>
              </div>
            </div>

            {/* Dynamic Weakness Recommendation & Tailored Session Banner */}
            <div className="rounded-3xl border border-indigo-150 bg-indigo-50/20 p-6 md:p-8 shadow-xs relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-fade-in">
              <div className="space-y-2 max-w-xl">
                <span className="px-2.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-indigo-100 text-indigo-750 border border-indigo-200/50 flex items-center gap-1 w-fit">
                  <Cpu className="h-3.5 w-3.5 text-indigo-600 animate-pulse" />
                  AI Recommended Practice Path
                </span>
                <h3 className="text-lg font-black text-indigo-950 leading-tight">
                  Start Tailored Multi-Part Diagnostic Session
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Focus Track: <strong className="text-indigo-950 font-bold">{adaptivePlan.focusArea}</strong>
                  <br />
                  <span className="mt-1 block text-slate-500 font-normal italic">{adaptivePlan.weaknessReason}</span>
                </p>
                
                {/* Highlight parts list */}
                <div className="flex gap-2 pt-2.5 flex-wrap">
                  {adaptivePlan.playlist.map((q, idx) => (
                    <span key={idx} className="bg-white border border-indigo-50 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600 flex items-center gap-1 shadow-3xs">
                      <span className="h-4 w-4 rounded-full bg-indigo-500 text-white flex items-center justify-center font-black text-[9px]">
                        {q.partType}
                      </span>
                      {q.topic}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  if (onStartPracticePlaylist) {
                    onStartPracticePlaylist(adaptivePlan.playlist);
                  }
                }}
                className="px-5 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shrink-0 cursor-pointer shadow-md shadow-indigo-600/10 flex items-center gap-1.5 self-stretch md:self-auto justify-center transition-all"
              >
                <span>Launch Diagnostic</span>
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>

            {/* Recharts Simple Timeline */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-extrabold text-indigo-950">Band Score Timeline</h3>
                  <p className="text-xs text-slate-400 font-medium">Track your IELTS score improvement curve</p>
                </div>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: 10 }} />
                    <YAxis domain={[1, 9]} stroke="#64748b" style={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1" }} />
                    <Line type="monotone" dataKey="Overall Band" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Fluency" stroke="#0ea5e9" strokeWidth={1} dot={false} />
                    <Line type="monotone" dataKey="Grammar" stroke="#db2777" strokeWidth={1} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Personalized Learning Path */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-lg font-bold text-indigo-950 mb-1.5 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-indigo-600" />
                Adaptive Voice Challenge Path
              </h3>
              <p className="text-xs text-slate-500 mb-6 font-medium">Specially tailored targets automatically adapting to grammar gaps</p>
              <div className="space-y-3">
                {dailyTasks.map((task, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-slate-55 p-3 px-4 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className={`sm:px-3 sm:py-1 px-1.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        task.done ? "bg-emerald-50 text-emerald-700 border border-emerald-250" : "bg-indigo-50 text-indigo-700 border border-indigo-250"
                      }`}>
                        {task.day}
                      </div>
                      <span className={`text-sm font-medium ${task.done ? "line-through text-slate-400" : "text-slate-700"}`}>
                        {task.title}
                      </span>
                    </div>
                    {task.done ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-slate-350 shrink-0"></div>
                    )}
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* Right sidebar details */}
          <div className="space-y-8">
            
            {/* Daily Study Streak Hub Card */}
            <div className="rounded-3xl border border-orange-200 bg-linear-to-br from-orange-50/55 to-amber-50/45 p-6 shadow-xs relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-28 h-28 bg-orange-250/20 rounded-full blur-2xl"></div>
              
              <div className="relative flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-orange-100 text-orange-600 animate-pulse">
                    <Flame className="h-5 w-5 fill-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 leading-tight">Study Streak Hub</h3>
                    <p className="text-[10px] text-orange-650 font-bold uppercase tracking-wider">Milestone Progress</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 bg-white/70 backdrop-blur-3xs border border-orange-150 px-2.5 py-1 rounded-full text-xs font-black text-orange-700 shadow-3xs">
                  <Sparkles className="h-3.5 w-3.5 text-orange-500 fill-orange-400" />
                  <span>{localStreak} Days</span>
                </div>
              </div>

              <p className="text-xs text-slate-650 leading-relaxed font-semibold mb-5">
                Practice daily to maintain your conversational peak. Unlock rewards & premium certificates!
              </p>

              {/* 7-Day Streak Milestone tracker */}
              <div className="bg-white/60 backdrop-blur-3xs rounded-2xl border border-orange-100 p-4 mb-5">
                <span className="text-[10px] text-slate-450 uppercase font-extrabold tracking-wider block mb-3.5">
                  7-Day Milestone Streak Tracker
                </span>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 7 }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const isCompleted = dayNum <= localStreak;
                    const isUpcomingMilestone = dayNum === 7;
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1.5">
                        <div 
                          className={`w-8 h-8 rounded-full flex items-center justify-center border text-xs font-black transition-all ${
                            isCompleted 
                              ? "bg-orange-500 border-orange-600 text-white shadow-xs shadow-orange-500/20 scale-105" 
                              : isUpcomingMilestone
                                ? "bg-indigo-50 border-dashed border-indigo-250 text-indigo-700"
                                : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4.5 w-4.5 stroke-[3]" />
                          ) : (
                            <span>{dayNum}</span>
                          )}
                        </div>
                        <span className="text-[9px] font-bold text-slate-400">
                          {isUpcomingMilestone ? "Goal" : `D${dayNum}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action trigger button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={handleClaimStreak}
                  className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                    streakClaimed 
                      ? "bg-slate-800 hover:bg-slate-905 text-white shadow-slate-900/10" 
                      : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-650 hover:to-amber-650 text-white shadow-orange-500/20 hover:scale-[1.01]"
                  }`}
                >
                  {streakClaimed ? (
                    <>
                      <Sparkles className="h-4 w-4 text-amber-300 animate-spin" />
                      <span>Replay Celebration!</span>
                    </>
                  ) : (
                    <>
                      <Flame className="h-4 w-4 text-white animate-bounce" />
                      <span>Claim Today's Streak (+50 XP)</span>
                    </>
                  )}
                </button>

                {/* Drifting XP Floating Animation Bubble */}
                <AnimatePresence>
                  {streakXpBonus && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.8 }}
                      animate={{ opacity: 1, y: -45, scale: 1.1 }}
                      exit={{ opacity: 0, y: -80, scale: 0.9 }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      className="absolute left-1/2 -translate-x-1/2 -top-2 flex items-center gap-1.5 px-3 py-1 bg-indigo-650 text-white rounded-full font-black text-xs shadow-md border border-indigo-505 pointer-events-none"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-300 animate-pulse" />
                      <span>+50 XP Streak Awarded!</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>

            {/* Gamification Achievements */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-lg font-bold text-indigo-950 mb-1.5 flex items-center gap-2">
                <Award className="h-4.5 w-4.5 text-indigo-650" />
                Gamified Awards & Badges
              </h3>
              <p className="text-xs text-slate-500 mb-6 font-medium">Achieve points for weekly streaks and speaking exams</p>
              <div className="grid grid-cols-2 gap-4">
                {achievements.map((ach) => (
                  <div key={ach.id} className={`p-3.5 rounded-xl border flex flex-col items-center text-center transition-all ${
                    ach.unlocked 
                      ? "bg-slate-50 border-indigo-200" 
                      : "bg-white border-slate-100 opacity-55"
                  }`}>
                    <div className={`h-11 w-11 rounded-full flex items-center justify-center mb-3 ${
                      ach.unlocked ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"
                    }`}>
                      {ach.unlocked ? <Award className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
                    </div>
                    <span className="text-xs font-bold text-slate-800 block leading-tight">{ach.title}</span>
                    <span className="text-[10px] text-slate-500 mt-1 block leading-normal">{ach.desc}</span>
                    <span className="text-[10px] font-bold text-indigo-600 mt-2 block">{ach.xp} XP</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weakness Detection Log */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-lg font-bold text-indigo-950 mb-1.5 flex items-center gap-2">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-550 animate-pulse" />
                Weakness Detector
              </h3>
              <p className="text-xs text-slate-500 mb-6 font-medium">AI flagged micro-errors in past evaluations</p>
              
              <div className="space-y-4">
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs leading-relaxed text-slate-705">
                  <div className="font-bold text-rose-700 flex items-center gap-1.5 mb-1.5">
                    <span>Common Pause Pattern:</span>
                  </div>
                  Long pauses occurring near transition clauses. We recommend reviewing **coordinating connectors** (e.g., "Nonethless", "Consequently").
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-slate-705">
                  <div className="font-bold text-amber-700 flex items-center gap-1.5 mb-1.5">
                    <span>Grammar Tense Shift:</span>
                  </div>
                  Shifting from Past Tense to Present simple mid cue-card narration. (e.g., "I went to Germany last year and I *go* to the park which was lovely"). Correct: *went*.
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* QUESTION BANK TAB */}
      {activeTab === "questions" && (
        <div>
          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-indigo-950">Kiran Makkar Speaking Guesswork Bank</h2>
              <p className="text-xs text-slate-550">Continuous voice practice from over 123+ dynamic Cue Cards and discussion topics</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none"
              >
                <option value="all">All Difficulty Levels</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              <select
                value={selectedPart}
                onChange={(e) => setSelectedPart(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none"
              >
                <option value="all">All IELTS Speaking Parts</option>
                <option value="1">Part 1 (General Qs)</option>
                <option value="2">Part 2 (Cue Cards)</option>
                <option value="3">Part 3 (Follow up Discuss)</option>
              </select>
            </div>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-250 bg-white p-12 text-center">
              <FileText className="h-10 w-10 text-slate-400 mx-auto mb-4" />
              <p className="text-sm font-semibold text-slate-500">No matching questions found in DB.</p>
              <button 
                onClick={handleLoadSampleDatabase}
                className="mt-4 px-5 py-2.5 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-md shadow-indigo-600/10 cursor-pointer"
              >
                Initialize Preloaded Guesswork Database
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredQuestions.map((q) => (
                <div 
                  key={q.id} 
                  className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between hover:border-indigo-400 hover:shadow-md transition-all shadow-xs group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                        q.partType === 1 
                          ? "bg-sky-50 text-sky-700 border-sky-100" 
                          : q.partType === 2 
                            ? "bg-purple-50 text-purple-700 border-purple-100" 
                            : "bg-amber-50 text-amber-705 border-amber-100"
                      }`}>
                        IELTS Part {q.partType}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        q.difficulty === "easy" 
                          ? "text-emerald-600" 
                          : q.difficulty === "medium" 
                            ? "text-amber-600" 
                            : "text-rose-600"
                      }`}>
                        {q.difficulty}
                      </span>
                    </div>

                    <h4 className="text-base font-extrabold text-slate-800 mb-2 leading-tight group-hover:text-indigo-600 transition-colors">
                      {q.topic}
                    </h4>

                    <p className="text-xs text-slate-500 mb-4 line-clamp-3">
                      "{q.question}"
                    </p>

                    {q.cueCardSubQuestions && q.cueCardSubQuestions.length > 0 && (
                      <div className="mb-4 bg-slate-55 p-3 rounded-xl border border-slate-100">
                        <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Prompts Checklist:</span>
                        <ul className="text-[10px] text-slate-500 space-y-1.5 pl-1">
                          {q.cueCardSubQuestions.map((sq, sIdx) => (
                            <li key={sIdx} className="flex items-start gap-1.5 leading-normal">
                              <span className="h-1 w-1 rounded-full bg-slate-400 mt-1.5 shrink-0"></span>
                              <span>{sq}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {q.keywords.slice(0, 2).map((kw, idx) => (
                        <span key={idx} className="text-[9px] bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-slate-450 font-bold">
                          #{kw}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => onStartPracticeQuestion(q)}
                      className="flex items-center gap-1 rounded-lg bg-indigo-600 group-hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-bold text-white transition-all cursor-pointer"
                    >
                      <span>Practice</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DETAILED ANALYTICS TAB */}
      {activeTab === "analytics" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-lg font-bold text-indigo-950 mb-1.5">IELTS Speaking Profile Breakdown</h3>
              <p className="text-xs text-slate-550 mb-6">Radar visualization of core metrics mapped to official rubrics</p>

              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#cbd5e1" />
                    <PolarAngleAxis dataKey="subject" stroke="#64748b" style={{ fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 9]} stroke="#64748b" style={{ fontSize: 9 }} />
                    <Radar name="Student Level" dataKey="value" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Performance Audit History */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-indigo-950 mb-1.5">Micro-Analytics & Speeches History</h3>
                <p className="text-xs text-slate-550 mb-6 font-medium">Historic metrics recorded across exam sessions</p>
                
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
                  {actualHistory.map((session, i) => (
                    <div key={i} className="py-3 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-extrabold text-slate-800 block">{session.topic}</span>
                        <span className="text-[10px] text-slate-400 font-medium">{session.sessionType === "mock_test" ? "Mock Exam" : "Practice"} • {session.createdAt}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="py-1 px-2.5 bg-indigo-50 text-indigo-700 border border-indigo-150 rounded text-xs font-bold leading-none">
                          Band {session.overallBand}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 md:flex flex-row items-center justify-between text-xs text-slate-400 hidden">
                <span>Continuously monitored using voice descriptors</span>
                <span className="text-indigo-650 font-bold">Auto evaluated on submission</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI ADAPTIVE DIAGNOSTIC TAB */}
      {activeTab === "adaptive" && (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
          <div className="rounded-3xl border border-indigo-150 bg-indigo-50/15 p-6 md:p-8 space-y-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-indigo-600 animate-pulse" />
              <h3 className="text-xl font-extrabold text-indigo-950">Baddie Buddy Dynamic Lesson Generator</h3>
            </div>
            <p className="text-xs text-slate-550 leading-relaxed font-semibold">
              Our educational algorithms continuously track and parse error counts, vocabulary repetition rates, and syntactic structures from your history. We dynamically recommend a tailored sequence of Parts 1, 2, and 3 topics designed to drill key weakness brackets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-3xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Diagnostics Audit</span>
                
                <div className="space-y-4 text-xs">
                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                    <span className="text-[10px] block font-bold text-indigo-750 uppercase">Active Weakness Priority</span>
                    <strong className="text-xs font-black text-indigo-950 mt-0.5 block">{adaptivePlan.focusArea}</strong>
                  </div>

                  <div className="space-y-1 font-semibold text-slate-600 font-sans">
                    <p className="text-[11px] leading-relaxed text-slate-500 italic font-normal">
                      {adaptivePlan.weaknessReason}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5 space-y-3 shadow-3xs text-center">
                <Trophy className="h-10 w-10 text-indigo-500 mx-auto animate-bounce" />
                <h4 className="text-xs font-bold text-indigo-950">Ready to boost your score?</h4>
                <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                  Completing a full multi-part tailored diagnostic yields <strong className="text-indigo-650 font-bold">150+ XP Bonus</strong> and updates your personal coaching profiles.
                </p>
                <button
                  onClick={() => {
                    if (onStartPracticePlaylist) {
                      onStartPracticePlaylist(adaptivePlan.playlist);
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs cursor-pointer shadow-md shadow-indigo-600/10 transition-all font-sans"
                >
                  Start Diagnostic Course
                </button>
              </div>
            </div>

            <div className="md:col-span-2 space-y-6">
              <h3 className="text-sm uppercase tracking-wider font-extrabold text-slate-500">Your Tailored 3-Part Syllabus</h3>

              <div className="space-y-4 font-sans">
                {adaptivePlan.playlist.map((q, idx) => (
                  <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-3xs relative overflow-hidden group hover:border-indigo-300 transition-all">
                    <div className="flex items-center justify-between mb-3 text-xs">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold tracking-wider uppercase border ${
                        q.partType === 1 
                          ? "bg-sky-50 text-sky-700 border-sky-100" 
                          : q.partType === 2 
                            ? "bg-purple-50 text-purple-700 border-purple-100" 
                            : "bg-amber-50 text-amber-705 border-amber-100"
                      }`}>
                        Part {q.partType} • {q.partType === 1 ? "Warm-Up" : q.partType === 2 ? "Cue Card" : "Deep Discussion"}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        q.difficulty === "easy" 
                          ? "text-emerald-600" 
                          : q.difficulty === "medium" 
                            ? "text-amber-600" 
                            : "text-rose-600"
                      }`}>
                        {q.difficulty}
                      </span>
                    </div>

                    <h4 className="text-base font-black text-slate-800 leading-tight mb-2">
                      Topic: {q.topic}
                    </h4>

                    <p className="text-xs text-slate-500 italic max-w-xl font-medium leading-relaxed">
                      "{q.question}"
                    </p>

                    {q.cueCardSubQuestions && q.cueCardSubQuestions.length > 0 && (
                      <div className="mt-3.5 bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <span className="block text-[10px] uppercase font-extrabold text-slate-400 tracking-wider mb-2">Required Core Points:</span>
                        <ul className="text-[10px] text-slate-500 space-y-1.5 pl-1.5 font-semibold">
                          {q.cueCardSubQuestions.map((sub, sIdx) => (
                            <li key={sIdx} className="flex items-center gap-2">
                              <span className="h-1 w-1 bg-indigo-500 rounded-full"></span>
                              <span>{sub}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF IMPORT & ADMIN TAB */}
      {activeTab === "admin" && (
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-lg font-bold text-indigo-950 mb-1.5 flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-500" />
              Upload Kiran Makkar Speaking Guesswork May-Aug 2026 PDF
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Dynamically load Speaking Part 1 questions, Cue Cards and Follow Up Questions into Baddie Buddy. If no binary parser exists locally, our server-side system processes text strings using Gemini to build structured IELTS database nodes.
            </p>

            {uploadMessage && (
              <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 text-xs text-indigo-700 font-bold">
                {uploadMessage}
              </div>
            )}

            <form onSubmit={handleSimulatedPdfExtraction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Paste IELTS PDF Text Content (Cue Cards & Parts Questions)
                </label>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste contents here... For example: Describe a technological problem you faced..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-mono text-slate-755 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="flex flex-wrap gap-4 justify-between items-center">
                <button
                  type="button"
                  onClick={handleLoadSampleDatabase}
                  className="px-5 py-2.5 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Bootstrap Guesswork Sample Bank
                </button>
                
                <button
                  type="submit"
                  disabled={isExtracting || !pastedText.trim()}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-6 py-3 text-xs font-bold text-indigo-50 hover:text-white transition-all disabled:opacity-45 cursor-pointer shadow-md shadow-indigo-650/10"
                >
                  <Upload className="h-4 w-4" />
                  {isExtracting ? "Analyzing & Parsing with AI..." : "Extract IELTS Elements"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
