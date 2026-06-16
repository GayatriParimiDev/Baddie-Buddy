import React, { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot, getDoc, setDoc, collection, getDocs, query } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "./firebase";
import { UserProfile, PracticeQuestion, SpeakingSessionResult } from "./types";
import { kiranQuestionsList } from "./data/kiranQuestions";
import Navigation from "./components/Navigation";
import Dashboard from "./components/Dashboard";
import SpeakingSession from "./components/SpeakingSession";
import LoginModal from "./components/LoginModal";
import { Sparkles, MessageSquare, ShieldAlert, Cpu, Laptop } from "lucide-react";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [availableQuestions, setAvailableQuestions] = useState<PracticeQuestion[]>(kiranQuestionsList);
  const [practiceHistory, setPracticeHistory] = useState<SpeakingSessionResult[]>([]);
  
  // Modals / Routing States
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<PracticeQuestion | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<PracticeQuestion[] | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "questions" | "analytics" | "adaptive" | "admin" >("overview");

  // Connection checking block
  const [authLoading, setAuthLoading] = useState(true);

  // Listen to Auth State
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubHistory: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Clean up previous listeners if any exist
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      if (unsubHistory) {
        unsubHistory();
        unsubHistory = null;
      }

      setCurrentUser(user);
      
      if (user) {
        // Sync or fetch detailed profile from Firestore
        const userDocRef = doc(db, "users", user.uid);
        let docSnap;
        try {
          docSnap = await getDoc(userDocRef);
        } catch (error) {
          // If the auth has changed or we are no longer signed in as this specific user, skip throwing
          if (auth.currentUser?.uid === user.uid) {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          }
        }

        if (auth.currentUser?.uid === user.uid) {
          if (docSnap && docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            // Create default profile if missing
            const defaultProfile: UserProfile = {
              uid: user.uid,
              name: user.displayName || user.email?.split("@")[0] || "IELTS Warrior",
              email: user.email || "",
              targetBand: 7.5,
              currentBand: 6.0,
              xp: 150,
              streak: 1,
              lastPracticeDate: new Date().toISOString().split("T")[0],
              totalHours: 0.1,
              sessionsCompleted: 0
            };
            try {
              await setDoc(userDocRef, defaultProfile);
            } catch (error) {
              if (auth.currentUser?.uid === user.uid) {
                handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
              }
            }
            if (auth.currentUser?.uid === user.uid) {
              setUserProfile(defaultProfile);
            }
          }

          // Listen for Realtime Profile Updates safely
          unsubProfile = onSnapshot(userDocRef, (snap) => {
            if (snap.exists() && auth.currentUser?.uid === user.uid) {
              setUserProfile(snap.data() as UserProfile);
            }
          }, (error) => {
            if (auth.currentUser?.uid === user.uid) {
              handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
            }
          });

          // Listen to Speeches Practice History safely
          const historyCollectionRef = collection(db, "users", user.uid, "sessions");
          unsubHistory = onSnapshot(historyCollectionRef, (snap) => {
            if (auth.currentUser?.uid === user.uid) {
              const sessions: SpeakingSessionResult[] = [];
              snap.forEach((doc) => {
                sessions.push({ id: doc.id, ...doc.data() } as SpeakingSessionResult);
              });
              // Sort by creation date
              sessions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
              setPracticeHistory(sessions);
            }
          }, (error) => {
            if (auth.currentUser?.uid === user.uid) {
              handleFirestoreError(error, OperationType.GET, `users/${user.uid}/sessions`);
            }
          });
        }
      } else {
        setUserProfile(null);
        setPracticeHistory([]);
      }
      setAuthLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
      if (unsubHistory) unsubHistory();
    };
  }, []);

  // Fetch Extra Questions from Firestore pdfQuestions collection
  const fetchQuestionsFromDB = async () => {
    try {
      const qColRef = collection(db, "pdfQuestions");
      let qSnap;
      try {
        qSnap = await getDocs(qColRef);
      } catch (error) {
        // If there's an error (e.g. unauthenticated or loading), we fall back gracefully to the preloaded bank
        console.warn("Could not fetch pdfQuestions, using preloaded fallback", error);
      }
      if (qSnap && !qSnap.empty) {
        const list: PracticeQuestion[] = [];
        qSnap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as PracticeQuestion);
        });
        setAvailableQuestions(list);
      } else {
        setAvailableQuestions(kiranQuestionsList);
      }
    } catch (e) {
      console.warn("Could not load dynamic questions from db registry:", e);
      setAvailableQuestions(kiranQuestionsList);
    }
  };

  useEffect(() => {
    fetchQuestionsFromDB();
  }, [currentUser]);

  const handleStartPracticeQuestion = (question: PracticeQuestion) => {
    if (!currentUser) {
      setIsLoginOpen(true);
      return;
    }
    setActivePlaylist(null);
    setActiveQuestion(question);
  };

  const handleStartPracticePlaylist = (questions: PracticeQuestion[]) => {
    if (!currentUser) {
      setIsLoginOpen(true);
      return;
    }
    if (questions && questions.length > 0) {
      setActivePlaylist(questions);
      setActiveQuestion(questions[0]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans selection:bg-indigo-500/20 selection:text-indigo-900 antialiased">
      
      {/* Primary header */}
      <Navigation 
        userProfile={userProfile} 
        onLoginClick={() => setIsLoginOpen(true)} 
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveQuestion(null);
          setActivePlaylist(null);
          setActiveTab(tab);
        }}
        onHomeClick={() => {
          setActiveQuestion(null);
          setActivePlaylist(null);
          setActiveTab("overview");
        }}
      />

      {/* Main app body screen router */}
      <main className="relative min-h-[calc(100vh-64px)] pb-12">
        {activeQuestion ? (
          <SpeakingSession
            question={activeQuestion}
            questionsPlaylist={activePlaylist || undefined}
            userProfile={userProfile}
            onClose={() => {
              setActiveQuestion(null);
              setActivePlaylist(null);
            }}
            onFinishSession={() => {
              setActiveQuestion(null);
              setActivePlaylist(null);
              fetchQuestionsFromDB();
            }}
          />
        ) : (
          <Dashboard
            userProfile={userProfile}
            practiceHistory={practiceHistory}
            availableQuestions={availableQuestions}
            onStartPracticeQuestion={handleStartPracticeQuestion}
            onStartPracticePlaylist={handleStartPracticePlaylist}
            onRefreshProfileAndQuestions={fetchQuestionsFromDB}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        )}
      </main>

      {/* Authentication controls popup */}
      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={() => setIsLoginOpen(false)} 
      />

      {/* Elegant minimalist footer */}
      <footer className="border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-6 text-center text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
        <span>Baddie Buddy IELTS Coach • Powered by Gemini 3.5 & Voice AI</span>
      </footer>

    </div>
  );
}
