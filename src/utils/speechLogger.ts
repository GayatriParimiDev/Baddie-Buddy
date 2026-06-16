export interface SpeechLogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  category: "connection" | "audio-capture" | "permission" | "recognition" | "silence";
  errorCode?: string;
  message: string;
}

export type SpeechLoggerSubscriber = (logs: SpeechLogEntry[], latestLog: SpeechLogEntry | null) => void;

class SpeechLogger {
  private logs: SpeechLogEntry[] = [];
  private subscribers: Set<SpeechLoggerSubscriber> = new Set();
  private maxLogs = 100;

  constructor() {
    this.log("info", "recognition", "Centralized Auditory Engine & Diagnostic Logger initialized.");
  }

  public getLogs(): SpeechLogEntry[] {
    return [...this.logs];
  }

  public subscribe(sub: SpeechLoggerSubscriber): () => void {
    this.subscribers.add(sub);
    // Initial call
    sub([...this.logs], this.logs[this.logs.length - 1] || null);
    
    return () => {
      this.subscribers.delete(sub);
    };
  }

  public log(
    type: "info" | "success" | "warning" | "error",
    category: SpeechLogEntry["category"],
    message: string,
    errorCode?: string
  ): SpeechLogEntry {
    const entry: SpeechLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      category,
      message,
      errorCode,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Notify subcribers
    this.subscribers.forEach((sub) => {
      try {
        sub([...this.logs], entry);
      } catch (err) {
        console.error("Error in speech logger subscriber:", err);
      }
    });

    console.log(`[SpeechAuditor] [${entry.type.toUpperCase()}] [${entry.category}] - ${entry.message}`);
    return entry;
  }

  public clear() {
    this.logs = [];
    this.log("info", "recognition", "System logs cleared.");
  }
}

export const speechLogger = new SpeechLogger();
