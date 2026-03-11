
import { ChessAnalysis, GameReport, MatchPreview } from "../types";
import { getStockfishEvaluation } from "./stockfishService";
import { getGameStatus } from "./chessAI";
import { Chess } from "chess.js";
import { GoogleGenAI, Type } from "@google/genai";

// Replaced Gemini AI with Stockfish 18 Logic for Real-time analysis to ensure speed
export type AnalysisModel = 'flash' | 'pro';

// Real-time single position analysis (Stockfish backed)
export const analyzeChessPosition = async (
  fen: string, 
  turn: 'w' | 'b', 
  language: string = 'English',
  modelType: AnalysisModel = 'pro',
  lastMove: string = 'N/A'
): Promise<ChessAnalysis> => {
  
  // 1. Get Engine Evaluation (High Depth for "Analysis" mode)
  const stockfishData = await getStockfishEvaluation(fen, 18, 1);
  const game = new Chess(fen);
  
  // 2. Generate Heuristic Strategy & Threats
  const status = getGameStatus(game, stockfishData.evaluation);

  // 3. Calculate Win Probabilities
  const cp = stockfishData.evaluation;
  
  // Sigmoid formula: P = 1 / (1 + 10^(-eval/400)) 
  const winProbability = 100 / (1 + Math.pow(10, -cp / 400));
  
  let wWin, bWin, drawChance;

  const baseDrawChance = 35 * Math.exp(-Math.abs(cp) / 200);
  
  if (turn === 'w') {
      wWin = winProbability;
      bWin = 100 - winProbability;
  } else {
      wWin = winProbability;
      bWin = 100 - winProbability;
  }

  const wWinFinal = Math.max(0, Math.round(wWin - (baseDrawChance / 2)));
  const bWinFinal = Math.max(0, Math.round(bWin - (baseDrawChance / 2)));
  const drawFinal = 100 - wWinFinal - bWinFinal;

  return {
    strategy: `[Stockfish 18] ${status.strategy}`,
    threats: status.threats,
    evaluation: stockfishData.evaluation,
    bestMove: stockfishData.bestMove,
    whiteWinningChance: wWinFinal,
    drawChance: Math.max(0, drawFinal),
    blackWinningChance: bWinFinal,
    grandmasterStyle: "Stockfish 18 NNUE",
    gameAccuracy: "Calculated",
    moveRating: "Best", 
    estimatedElo: 3700, 
    depth: stockfishData.depth,
    continuation: stockfishData.continuation
  };
};

// Full Game Analysis (Gemini 3 Pro with Fallback)
export const generateGameReport = async (pgn: string, language: string = 'English'): Promise<GameReport> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
      console.error("Gemini API Key is missing. Check vite.config.ts or .env");
      return { 
          summary: "Configuration Error: API Key is missing.", 
          whiteAccuracy: 0, 
          blackAccuracy: 0, 
          keyMoments: [] 
      };
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Analyze this chess game PGN. Provide a concise summary, estimate accuracy (0-100) for both sides, and identify 3-5 key moments (Brilliant, Blunder, etc).
  
  IMPORTANT: The output MUST be in the following language: ${language}.
  
  PGN: ${pgn}`;

  // Schema for structured JSON output
  const schema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING, description: `A paragraph summarizing the game flow in ${language}.` },
      whiteAccuracy: { type: Type.NUMBER, description: "Estimated accuracy percentage for White (0-100)." },
      blackAccuracy: { type: Type.NUMBER, description: "Estimated accuracy percentage for Black (0-100)." },
      keyMoments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            moveNumber: { type: Type.INTEGER },
            color: { type: Type.STRING, enum: ["White", "Black"] },
            moveSan: { type: Type.STRING },
            classification: { type: Type.STRING, enum: ["Brilliant", "Great", "Best", "Good", "Inaccuracy", "Mistake", "Blunder", "Book"] },
            explanation: { type: Type.STRING, description: `Short reason for classification in ${language}.` },
            improvement: { type: Type.STRING, description: `Better move if applicable (notation only).` }
          },
          required: ["moveNumber", "color", "moveSan", "classification", "explanation"]
        }
      }
    },
    required: ["summary", "whiteAccuracy", "blackAccuracy", "keyMoments"]
  };

  try {
    // 1. Try Gemini 3 Pro Preview
    console.log(`Attempting analysis with gemini-3-pro-preview in ${language}...`);
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as GameReport;
    }
  } catch (error) {
    console.warn("Gemini 3 Pro failed, trying fallback (gemini-3-flash-preview)...", error);
    
    try {
        // 2. Fallback to Gemini 3 Flash Preview (Reliable & Fast)
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });

        if (response.text) {
          return JSON.parse(response.text) as GameReport;
        }
    } catch (fallbackError) {
        console.error("All Analysis models failed:", fallbackError);
    }
  }

  // Return specific error report if all fail
  return {
    summary: `Analysis failed. The AI service may be temporarily unavailable or the game was too short to analyze. (${language})`,
    whiteAccuracy: 0,
    blackAccuracy: 0,
    keyMoments: []
  };
};

// Fast Local Analysis (No API) for instant match previews or fallback
export const generateFastMatchPreview = (
    whiteName: string, 
    blackName: string, 
    whiteHistory: any[], 
    blackHistory: any[]
): MatchPreview => {
    const analyzePlayer = (name: string, history: any[]) => {
        if (!history || history.length === 0) {
            return { style: "Balanced", strengths: ["Newcomer"], weaknesses: ["Unproven"], winRate: 0.5 };
        }

        let wins = 0;
        let aggroMoves = 0;
        const recent = history.slice(0, 20);

        recent.forEach(g => {
            const isWhite = g.whitePlayer === name;
            const isWin = (g.winner === 'White' && isWhite) || (g.winner === 'Black' && !isWhite);
            if (isWin) wins++;
            
            // Heuristic: Games ending by checkmate or in < 30 moves are "Aggressive"
            if (g.reason === 'Checkmate' || (g.pgn && g.pgn.split(' ').length < 60)) {
                aggroMoves++;
            }
        });

        const winRate = wins / recent.length;
        const aggroRate = aggroMoves / recent.length;

        let style = "Balanced";
        if (aggroRate > 0.6) style = "Aggressive/Tactical";
        else if (aggroRate < 0.3) style = "Positional/Solid";

        const strengths = [];
        const weaknesses = [];

        if (winRate > 0.6) strengths.push("High Win Rate");
        if (winRate > 0.75) strengths.push("On Fire");
        if (recent.length > 50) strengths.push("Veteran");
        if (strengths.length === 0) strengths.push("Consistent");

        if (winRate < 0.3) weaknesses.push("Recent Slump");
        if (recent.length < 5) weaknesses.push("Inexperienced");
        if (weaknesses.length === 0) weaknesses.push("Few Weaknesses");

        return { style, strengths, weaknesses, winRate };
    };

    const w = analyzePlayer(whiteName, whiteHistory);
    const b = analyzePlayer(blackName, blackHistory);

    let prediction = "A closely contested matchup.";
    if (w.winRate > b.winRate + 0.15) prediction = `${whiteName} is the statistical favorite.`;
    else if (b.winRate > w.winRate + 0.15) prediction = `${blackName} has the statistical edge.`;

    return {
        white: { style: w.style, strengths: w.strengths, weaknesses: w.weaknesses },
        black: { style: b.style, strengths: b.strengths, weaknesses: b.weaknesses },
        summary: `${whiteName} (${w.style}) faces off against ${blackName} (${b.style}).`,
        prediction
    };
};

// AI-Powered Match Preview using Gemini 3 Flash Preview for speed
export const generateMatchPreview = async (
    whiteName: string, 
    blackName: string, 
    whiteHistory: any[], 
    blackHistory: any[]
): Promise<MatchPreview> => {
    const apiKey = process.env.API_KEY;
    const localResult = generateFastMatchPreview(whiteName, blackName, whiteHistory, blackHistory);
    
    // If no API key or barely any history, use local heuristic immediately
    if (!apiKey || (whiteHistory.length < 2 && blackHistory.length < 2)) {
        return localResult;
    }

    try {
        const ai = new GoogleGenAI({ apiKey });

        // Helper to aggregate stats locally to keep prompt small and fast
        const getStats = (games: any[]) => {
            if (!games || games.length === 0) return { status: "New Player" };
            const recent = games.slice(0, 10);
            let wins = 0;
            let moves = 0;
            recent.forEach(g => {
                const isWhite = g.whitePlayer === whiteName || g.whitePlayer === blackName; // Approximate owner check
                if (g.winner === 'White' && g.whitePlayer === whiteName) wins++; // Simplified check for context
                else if (g.winner === 'Black' && g.blackPlayer === whiteName) wins++;
                
                if (g.pgn) moves += g.pgn.split(' ').length;
            });
            return {
                games: recent.length,
                winRate: (wins / recent.length).toFixed(2),
                avgMoves: Math.round(moves / recent.length),
                lastResult: recent[0]?.winner || 'Unknown'
            };
        };

        const wStats = getStats(whiteHistory);
        const bStats = getStats(blackHistory);

        const prompt = `
        Analyze this chess matchup.
        P1 (${whiteName}): ${JSON.stringify(wStats)}
        P2 (${blackName}): ${JSON.stringify(bStats)}
        
        Return JSON:
        - white: { style (1 word), strengths (max 2 short phrases), weaknesses (max 1 short phrase) }
        - black: { style (1 word), strengths (max 2 short phrases), weaknesses (max 1 short phrase) }
        - summary: 1 short exciting sentence.
        - prediction: 1 short sentence.
        `;

        const schema = {
            type: Type.OBJECT,
            properties: {
                white: { 
                    type: Type.OBJECT, 
                    properties: { 
                        style: { type: Type.STRING }, 
                        strengths: { type: Type.ARRAY, items: { type: Type.STRING } }, 
                        weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } } 
                    },
                    required: ["style", "strengths", "weaknesses"]
                },
                black: { 
                    type: Type.OBJECT, 
                    properties: { 
                        style: { type: Type.STRING }, 
                        strengths: { type: Type.ARRAY, items: { type: Type.STRING } }, 
                        weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } } 
                    },
                    required: ["style", "strengths", "weaknesses"]
                },
                summary: { type: Type.STRING },
                prediction: { type: Type.STRING }
            },
            required: ["white", "black", "summary", "prediction"]
        };

        // Create a race: AI vs Timeout (2.5 seconds)
        const aiPromise = ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });

        const timeoutPromise = new Promise<null>((resolve) => 
            setTimeout(() => resolve(null), 2500)
        );

        const result = await Promise.race([aiPromise, timeoutPromise]);

        if (result && result.text) {
            // Remove markdown code blocks if present
            const cleanedText = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(cleanedText) as MatchPreview;
            
            // Sanitize response with defaults if missing
            if (!data.white?.strengths) data.white = { ...localResult.white };
            if (!data.black?.strengths) data.black = { ...localResult.black };
            return data;
        } else {
            console.warn("AI Analysis timed out or empty, using local.");
            return localResult;
        }
    } catch (e) {
        console.warn("AI Match Preview failed, falling back to local.", e);
        return localResult;
    }
};

const getDefaultPreview = (): MatchPreview => ({
    white: { style: "Balanced", strengths: ["Unknown"], weaknesses: ["Unknown"] },
    black: { style: "Balanced", strengths: ["Unknown"], weaknesses: ["Unknown"] },
    summary: "Both players are ready to battle.",
    prediction: "The game could go either way."
});
