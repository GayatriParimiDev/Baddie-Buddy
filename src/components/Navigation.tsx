import React from "react";
import { UserProfile } from "../types";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { Sparkles, Flame, Trophy, LogOut, User, Target, Sun, Moon } from "lucide-react";

interface NavigationProps {
  userProfile: UserProfile | null;
  onLoginClick: () => void;
  activeTab: "overview" | "questions" | "analytics" | "adaptive" | "admin";
  setActiveTab: (tab: "overview" | "questions" | "analytics" | "adaptive" | "admin") => void;
  onHomeClick: () => void;
}

export default function Navigation({ 
  userProfile, 
  onLoginClick,
  activeTab,
  setActiveTab,
  onHomeClick
}: NavigationProps) {
  const [isDark, setIsDark] = React.useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("baddie_theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  React.useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("baddie_theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("baddie_theme", "light");
    }
  }, [isDark]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Sign out error", e);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/55 dark:border-zinc-800/80 bg-white/60 dark:bg-[#12101a]/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all">
      <div className="mx-auto flex flex-col lg:flex-row min-h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6 py-3 lg:py-0 gap-3 lg:gap-6">
        
        {/* Brand Group */}
        <button 
          onClick={onHomeClick}
          className="flex items-center gap-3 text-left focus:outline-none hover:opacity-95 active:scale-98 transition-all cursor-pointer select-none group"
        >
          <div className="w-10 h-10 bg-gradient-to-tr from-[#5427e6] to-[#1351d3] rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="w-5 h-5 bg-white rounded-md rotate-45 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-[#5427e6] -rotate-45 fill-[#5427e6]/20" />
            </div>
          </div>
          <div>
            <span className="text-xl font-black tracking-tight text-gradient block">
              Baddie Buddy
            </span>
            <span className="text-[9px] font-black uppercase tracking-wider text-[#5427e6] dark:text-indigo-300 border border-indigo-150/50 dark:border-indigo-900/45 bg-[#5427e6]/5 dark:bg-[#5427e6]/20 px-1.5 py-0.5 rounded-full">
              IELTS Band 9 Coach
            </span>
          </div>
        </button>

        {/* Global Navigation Options */}
        <nav className="flex items-center gap-1 bg-[#fdf8ff] dark:bg-[#1a1726]/60 p-1.5 rounded-2xl border border-slate-200/40 dark:border-zinc-800/80 max-w-full overflow-x-auto scrollbar-none shrink-0 scroll-smooth shadow-inner">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-1.8 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "overview"
                ? "bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white shadow-md shadow-indigo-500/15 font-black"
                : "text-[#484556] dark:text-zinc-400 hover:text-[#5427e6] dark:hover:text-white hover:bg-[#5427e6]/5 dark:hover:bg-zinc-800"
            }`}
          >
            Concept & Home
          </button>
          <button
            onClick={() => setActiveTab("questions")}
            className={`px-4 py-1.8 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "questions"
                ? "bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white shadow-md shadow-indigo-500/15 font-black"
                : "text-[#484556] dark:text-zinc-400 hover:text-[#5427e6] dark:hover:text-white hover:bg-[#5427e6]/5 dark:hover:bg-zinc-800"
            }`}
          >
            Speaking Bank
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-4 py-1.8 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "analytics"
                ? "bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white shadow-md shadow-indigo-500/15 font-black"
                : "text-[#484556] dark:text-zinc-400 hover:text-[#5427e6] dark:hover:text-white hover:bg-[#5427e6]/5 dark:hover:bg-zinc-800"
            }`}
          >
            Analytics Reports
          </button>
          <button
            onClick={() => setActiveTab("adaptive")}
            className={`px-4 py-1.8 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "adaptive"
                ? "bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white shadow-md shadow-indigo-500/15 font-black"
                : "text-[#484556] dark:text-zinc-400 hover:text-[#5427e6] dark:hover:text-white hover:bg-[#5427e6]/5 dark:hover:bg-zinc-800"
            }`}
          >
            Adaptive Path
          </button>
          <button
            onClick={() => setActiveTab("admin")}
            className={`px-4 py-1.8 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "admin"
                ? "bg-gradient-to-r from-[#5427e6] to-[#1351d3] text-white shadow-md shadow-indigo-500/15 font-black"
                : "text-[#484556] dark:text-zinc-400 hover:text-[#5427e6] dark:hover:text-white hover:bg-[#5427e6]/5 dark:hover:bg-zinc-800"
            }`}
          >
            PDF Upload
          </button>
        </nav>

        {/* Stats & Profiles */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={() => setIsDark(!isDark)}
            title={isDark ? "Activate light mode" : "Activate dark mode"}
            aria-label={isDark ? "Activate light mode" : "Activate dark mode"}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/60 dark:border-zinc-800/80 bg-white/85 dark:bg-[#12101a]/85 text-[#484556] dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:text-[#5427e6] dark:hover:text-indigo-400 transition-all cursor-pointer shadow-3xs mr-1"
          >
            {isDark ? (
              <Sun className="h-4.5 w-4.5 text-amber-500 fill-amber-400" />
            ) : (
              <Moon className="h-4.5 w-4.5 text-[#5427e6] fill-indigo-100" />
            )}
          </button>

          {userProfile ? (
            <>
              {/* Streak */}
              <div className="flex items-center gap-1.5 rounded-full border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-1 text-[10px] font-bold text-amber-800 dark:text-amber-300 shadow-3xs">
                <Flame className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                <span>{userProfile.streak || 1}d</span>
              </div>

              {/* XP */}
              <div className="flex items-center gap-1.5 rounded-full border border-indigo-100 dark:border-indigo-900/45 bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-1 text-[10px] font-bold text-indigo-800 dark:text-indigo-300 shadow-3xs">
                <Trophy className="h-3.5 w-3.5 text-[#5427e6] dark:text-indigo-400" />
                <span>{userProfile.xp || 100} XP</span>
              </div>

              {/* Current / Target Band Display */}
              <div className="hidden sm:flex items-center gap-3 text-[10px] font-bold text-[#484556] dark:text-zinc-400">
                <div className="flex items-center gap-0.5">
                  <Target className="h-3 w-3 text-[#5427e6]" />
                  <span>Target: <strong className="text-[#5427e6] dark:text-indigo-300 font-extrabold">B{userProfile.targetBand || 7.5}</strong></span>
                </div>
                <div className="flex items-center gap-0.5">
                  <Trophy className="h-3 w-3 text-emerald-500" />
                  <span>Latest: <strong className="text-[#1351d3] dark:text-indigo-200 font-extrabold">B{userProfile.currentBand || 6.0}</strong></span>
                </div>
              </div>

              {/* User Avatar Menu */}
              <div className="flex items-center gap-2.5 pl-2.5 border-l border-slate-200 dark:border-zinc-800">
                <div className="flex flex-col items-end text-right">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-zinc-200 max-w-[90px] truncate">
                    {userProfile.name}
                  </span>
                  <span className="text-[9px] text-[#484556]/70 dark:text-zinc-500 truncate max-w-[90px]">
                    {userProfile.email}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="rounded-xl border border-slate-200 dark:border-zinc-800 p-2 text-[#484556] dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:text-rose-600 dark:hover:text-rose-400 transition-all cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={onLoginClick}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#5427e6] to-[#1351d3] hover:opacity-90 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-500/10 transition-all cursor-pointer"
            >
              <User className="h-3.5 w-3.5" />
              Sign In
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
