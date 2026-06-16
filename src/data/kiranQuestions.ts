import { PracticeQuestion } from "../types";

export const kiranQuestionsList: PracticeQuestion[] = [
  // --- PART 1 ---
  {
    id: "p1_language",
    topic: "Language Learning",
    partType: 1,
    question: "Do you enjoy learning new languages? Why or why not?",
    difficulty: "easy",
    category: "Languages",
    keywords: ["language", "communication", "studies"]
  },
  {
    id: "p1_travel",
    topic: "Travel & Leisure",
    partType: 1,
    question: "Do you prefer traveling alone or with other people?",
    difficulty: "easy",
    category: "Travel",
    keywords: ["travel", "social", "vacation"]
  },
  {
    id: "p1_nature",
    topic: "Nature",
    partType: 1,
    question: "Do you spend a lot of time in parks or natural settings?",
    difficulty: "easy",
    category: "Nature",
    keywords: ["parks", "outdoors", "scenery"]
  },
  {
    id: "p1_tech",
    topic: "Technology",
    partType: 1,
    question: "What is your favorite modern gadget, and how often do you use it?",
    difficulty: "easy",
    category: "Technology",
    keywords: ["gadget", "daily", "computer"]
  },

  // --- PART 2: CUE CARDS ---
  {
    id: "p2_language_thing",
    topic: "Describe a thing you did to learn another language",
    partType: 2,
    question: "Describe a thing you did to learn another language.",
    cueCardSubQuestions: [
      "What it was",
      "When you did it",
      "How it helped you learn the language",
      "And explain how you felt about this experience"
    ],
    difficulty: "medium",
    category: "Languages",
    keywords: ["method", "effort", "bilingual", "German", "Spanish"]
  },
  {
    id: "p2_longterm_goal",
    topic: "Describe a long-term goal",
    partType: 2,
    question: "Describe a long-term goal you would like to achieve in the future.",
    cueCardSubQuestions: [
      "What the goal is",
      "How long you have had this goal",
      "What plans you need to achieve it",
      "And explain why this goal is important to you"
    ],
    difficulty: "hard",
    category: "Goals",
    keywords: ["aspiration", "career", "future", "ambition"]
  },
  {
    id: "p2_city_visited",
    topic: "Describe a city you visited",
    partType: 2,
    question: "Describe a beautiful city you visited as a traveler.",
    cueCardSubQuestions: [
      "Which city it was and where it is located",
      "When and why you went there",
      "What interesting places you saw",
      "And explain what made this city particularly memorable to you"
    ],
    difficulty: "medium",
    category: "Travel",
    keywords: ["sightseeing", "architecture", "tourism", "vacation"]
  },
  {
    id: "p2_nature_helper",
    topic: "Describe a person who likes to look after nature",
    partType: 2,
    question: "Describe a person you know who likes to look after nature or the environment.",
    cueCardSubQuestions: [
      "Who this person is",
      "How you met this person",
      "What eco-friendly actions they take",
      "And explain why you respect their commitment to nature"
    ],
    difficulty: "medium",
    category: "Nature",
    keywords: ["ecology", "green", "recycle", "inspiration"]
  },
  {
    id: "p2_tech_challenge",
    topic: "Describe a challenging technological problem you faced",
    partType: 2,
    question: "Describe a challenging technological problem you faced which you successfully resolved.",
    cueCardSubQuestions: [
      "What the technology device or software was",
      "What problem occurred and when it happened",
      "How you went about resolving it",
      "And explain how you felt once the problem was solved"
    ],
    difficulty: "hard",
    category: "Technology",
    keywords: ["troubleshooting", "broken", "software", "frustration", "fix"]
  },

  // --- PART 3: ADVANCED FOLLOW-UPS ---
  {
    id: "p3_language_global",
    topic: "Global Languages",
    partType: 3,
    question: "Do you believe the internet is speeding up the extinction of minority languages? Why or why not?",
    difficulty: "hard",
    category: "Languages",
    keywords: ["globalization", "minority", "internet", "culture"]
  },
  {
    id: "p3_goals_motivation",
    topic: "Human Motivation",
    partType: 3,
    question: "Why do some people find it difficult to stick to their long-term resolutions, while others succeed?",
    difficulty: "medium",
    category: "Goals",
    keywords: ["habits", "grit", "willpower", "psychology"]
  },
  {
    id: "p3_travel_economy",
    topic: "Impact of Tourism",
    partType: 3,
    question: "Should governments restrict international tourism to protect ancient landmarks from erosion? How?",
    difficulty: "hard",
    category: "Travel",
    keywords: ["heritage", "pollution", "policy", "regulations"]
  },
  {
    id: "p3_nature_awareness",
    topic: "Environmental Education",
    partType: 3,
    question: "Whose responsibility is it to teach children about climate preservation: schools, parents, or commercial organizations?",
    difficulty: "hard",
    category: "Nature",
    keywords: ["preservation", "pedagogy", "future", "global warming"]
  },
  {
    id: "p3_tech_society",
    topic: "Digital Dependency",
    partType: 3,
    question: "In what ways has the continuous flow of digital notifications shaped the attention spans of modern students?",
    difficulty: "hard",
    category: "Technology",
    keywords: ["cognitive", "attention", "smartphones", "learning"]
  }
];
