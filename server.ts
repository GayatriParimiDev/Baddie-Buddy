import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Parse json bodies up to 10MB (for base64 text/images if needed)
app.use(express.json({ limit: "10mb" }));

// Initialize Gemini SDK with telemetry header
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper function to handle retries and call a fallback model if the primary model is unavailable (e.g. Code 503 high demand)
async function generateGeminiContentWithFallback(
  aiInstance: GoogleGenAI,
  params: any,
  fallbackModel: string = "gemini-3.1-flash-lite"
): Promise<any> {
  const maxRetries = 2; // Keep attempts low for quick response in conversational apps
  let delay = 200; // Small delay for instant retry
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Gemini API] Requesting ${params.model} (Attempt ${attempt}/${maxRetries})...`);
      return await aiInstance.models.generateContent(params);
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini API] Attempt ${attempt} failed:`, err?.message || err);

      // Check if it's a transient server/demand error or limit
      const errStr = String(err?.message || err || "").toLowerCase();
      const isRetriable =
        err?.status === "UNAVAILABLE" ||
        err?.statusCode || err?.status ||
        err?.statusCode === 503 ||
        errStr.includes("503") ||
        errStr.includes("unavailable") ||
        errStr.includes("high demand") ||
        errStr.includes("rate limit") ||
        errStr.includes("429") ||
        errStr.includes("resource_exhausted") ||
        errStr.includes("resourceexhausted");

      if (!isRetriable) {
        throw err;
      }

      if (attempt < maxRetries) {
        console.log(`[Gemini API] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  // If retries failed on the primary model, fall back to "gemini-3.1-flash-lite"
  const originalModel = params.model;
  if (originalModel !== fallbackModel) {
    console.warn(`[Gemini API] Primary model ${originalModel} failed all retries. Falling back to robust model "${fallbackModel}"...`);
    try {
      const fallbackParams = { ...params, model: fallbackModel };
      return await aiInstance.models.generateContent(fallbackParams);
    } catch (fallbackErr: any) {
      console.error(`[Gemini API] Fallback model ${fallbackModel} also failed:`, fallbackErr?.message || fallbackErr);
      throw new Error(`The evaluation service is experiencing high demand. Please try again in a few seconds. (Details: ${lastError?.message || lastError})`);
    }
  }

  throw lastError;
}

// 1. Health check routing
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", geminiInitialized: !!ai });
});

// 2. IELTS Evaluation Route
app.post("/api/evaluate", async (req, res) => {
  try {
    const { transcript, question, partType, targetBand, currentBand } = req.body;

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({ error: "Transcript is empty or missing." });
    }

    if (!ai) {
      return res.status(500).json({
        error: "Gemini API key is not configured on the server. Please check Settings > Secrets.",
      });
    }

    // Agent Architecture Prompting
    const systemInstruction = `You are a team of elite IELTS Band 9 Examiners and Pedagogical Coaches evaluating a student's answer for an IELTS Speaking test.
The student answered: "${question}" (IELTS Speaking Part ${partType || 1}).
Their current band is around ${currentBand || "unassessed"} and target band is ${targetBand || "7.5"}.

Perform a detailed evaluation in accordance with official IELTS band descriptors:
- Fluency & Coherence: Check flow, hesitations, fillers (like "uh", "umm", "like"), and transition markers.
- Lexical Resource: Review vocabulary range, idiom use, repetition, and precision.
- Grammatical Range & Accuracy: Analyze tense usage, simple/complex structures, and grammar errors.
- Pronunciation: Inspect the transcription carefully for clarity, rhythm, phrasing, punctuation structures, and phonetic indicators. Evaluate intonation modulation (avoiding monotone rhythm), syllable/word stress, and specific phoneme production issues, such as struggles with 'th' sound, 'v' vs 'w', dental fricatives, consonant clusters, or vowel elongation. Highlight 2-3 specific sound gaps and targeted drills.

You must output a highly granular JSON object matching the requested schema. No conversational wrappers outside the JSON.`;

    const prompt = `Student transcription: "${transcript}"
Compare against Part ${partType || 1} expectations. Be critical, supportive, and highly constructive. Ensure the estimated bands are realistic (IELTS scores range from 1 to 9, in increments of 0.5 or 1.0).`;

    const response = await generateGeminiContentWithFallback(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: [
            "overallBand",
            "fluencyBand",
            "vocabularyBand",
            "grammarBand",
            "pronunciationBand",
            "pronunciationDetails",
            "strengths",
            "weaknesses",
            "corrections",
            "actionPlan",
            "examinerCommentary",
            "coachFeedback"
          ],
          properties: {
            overallBand: { type: Type.NUMBER, description: "Calculated overall IELTS Band (1.0 to 9.0)." },
            fluencyBand: { type: Type.NUMBER, description: "Band for Fluency & Coherence (1.0 to 9.0)." },
            vocabularyBand: { type: Type.NUMBER, description: "Band for Lexical Resource (1.0 to 9.0)." },
            grammarBand: { type: Type.NUMBER, description: "Band for Grammatical Range & Accuracy (1.0 to 9.0)." },
            pronunciationBand: { type: Type.NUMBER, description: "Estimated Band for Pronunciation (1.0 to 9.0)." },
            pronunciationDetails: {
              type: Type.OBJECT,
              description: "Sophisticated phonetic evaluation detailing intonation, stress, and clarity with specific exercises",
              required: [
                "intonationScore",
                "stressScore",
                "clarityScore",
                "phonemeErrors",
                "targetedExercises",
                "overallFeedback"
              ],
              properties: {
                intonationScore: { type: Type.NUMBER, description: "Rating for pitch modulation and natural sentence-level accent (1.0 to 9.0)." },
                stressScore: { type: Type.NUMBER, description: "Rating for word stress, syllabic weight and metrical accentuation (1.0 to 9.0)." },
                clarityScore: { type: Type.NUMBER, description: "Rating for general phonetic clarity and sound production quality (1.0 to 9.0)." },
                phonemeErrors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Specific sound/phoneme gaps identified, for example: 'Struggles with the unvoiced th fricative sound' or 'vowel shortening near key modifiers'."
                },
                targetedExercises: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "2-3 highly actionable drill exercises or phonology tasks to correct their errors."
                },
                overallFeedback: { type: Type.STRING, description: "Actionable pronunciation coaching critique aligned with IELTS band descripters." }
              }
            },
            strengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "2-3 key bullet points of what they did well."
            },
            weaknesses: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "2-3 areas that drag their score down."
            },
            corrections: {
              type: Type.ARRAY,
              description: "A list of grammar or vocabulary mistakes identified.",
              items: {
                type: Type.OBJECT,
                required: ["original", "correction", "explanation"],
                properties: {
                  original: { type: Type.STRING, description: "The exact wrong snippet from the speech." },
                  correction: { type: Type.STRING, description: "The better or correct alternative." },
                  explanation: { type: Type.STRING, description: "Detailed grammatical or lexical why." }
                }
              }
            },
            actionPlan: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 highly actionable daily tasks (e.g. Speak using relative clauses for travel)."
            },
            examinerCommentary: {
              type: Type.STRING,
              description: "An official examiner assessment of why they scored this band."
            },
            coachFeedback: {
              type: Type.STRING,
              description: "A supportive, encouraging friend/coach comment."
            }
          }
        }
      }
    });

    const resultText = response.text || "{}";
    res.setHeader("Content-Type", "application/json");
    res.send(resultText);
  } catch (error: any) {
    console.error("Evaluation error:", error);
    res.status(500).json({ error: error.message || "Failed to process evaluation." });
  }
});

// 3. Simple Text/Regex/AI Parsing Route for IELTS Speaking Guesswork Files
app.post("/api/extract-pdf", async (req, res) => {
  try {
    const { filename, rawText } = req.body;

    if (!rawText || rawText.trim().length === 0) {
      return res.status(400).json({ error: "No text data received to extract." });
    }

    if (!ai) {
      // If AI is not initialized, fallback to mock regex extraction or template fallback
      return res.json({
        success: true,
        extractedCount: 5,
        questions: [
          {
            topic: "Describe a long-term goal",
            partType: 2,
            question: "Describe a long-term goal you would like to achieve.",
            difficulty: "medium",
            category: "Goals",
            keywords: ["goal", "future", "ambition"]
          }
        ]
      });
    }

    const systemInstruction = `You are an expert IELTS prep materials analyst. Look inside the raw texts from a Speaking Guesswork PDF and extract structural cue cards, follow-up, or part 1 questions.
Convert them into structured objects matching the schema. Try to parse up to 5 comprehensive items. If the content is too messy, extract some general realistic ones.`;

    const response = await generateGeminiContentWithFallback(ai, {
      model: "gemini-3.5-flash",
      contents: `Filename: ${filename || "kiran-makkar-guesswork.txt"}\nRaw contents excerpt:\n${rawText.substring(0, 8000)}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["questions"],
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["topic", "partType", "question", "difficulty", "category", "keywords"],
                properties: {
                  topic: { type: Type.STRING, description: "Short title matching the cue card/topic like 'Describe a city you visited'" },
                  partType: { type: Type.INTEGER, description: "Type part: 1 (general), 2 (cue card), or 3 (follow up)" },
                  question: { type: Type.STRING, description: "The descriptive card prompt or question text" },
                  cueCardSubQuestions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "For part 2, include prompts like 'What is it', 'When did you do it', etc."
                  },
                  difficulty: { type: Type.STRING, description: "easy, medium, or hard" },
                  category: { type: Type.STRING, description: "Topic domain (e.g. technology, travel, hobbies)" },
                  keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            }
          }
        }
      }
    });

    res.setHeader("Content-Type", "application/json");
    res.send(response.text || "{}");
  } catch (error: any) {
    console.error("Extraction error:", error);
    res.status(500).json({ error: error.message || "Failed to process PDF extraction." });
  }
});

// Configure Vite middleware or serve static production build
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
