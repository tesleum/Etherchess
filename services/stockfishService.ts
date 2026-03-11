
// Using a stable version of Stockfish.js from CDN
// We use the "blob" technique to bypass CORS restrictions on Web Workers
const STOCKFISH_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js';

let stockfishWorker: Worker | null = null;

const initWorker = async (): Promise<Worker> => {
  if (stockfishWorker) return stockfishWorker;

  try {
    const response = await fetch(STOCKFISH_CDN_URL);
    const script = await response.text();
    const blob = new Blob([script], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    stockfishWorker = new Worker(url);
    
    // Initialize UCI mode
    stockfishWorker.postMessage('uci');
    
    // STOCKFISH 18 CONFIGURATION UPGRADE
    // Maximize browser performance
    stockfishWorker.postMessage('setoption name Threads value 4'); // Use 4 threads if available
    stockfishWorker.postMessage('setoption name Hash value 64');   // Increase Hash to 64MB
    stockfishWorker.postMessage('setoption name Skill Level value 20'); // Max skill
    stockfishWorker.postMessage('setoption name MultiPV value 1');
    
    return stockfishWorker;
  } catch (error) {
    console.error("Failed to load Stockfish worker:", error);
    throw error;
  }
};

interface StockfishResult {
  bestMove: string;
  evaluation: number;
  secondaryMove?: string;
  secondaryEvaluation?: number;
  depth: number;
  continuation: string;
}

/**
 * Analyzes a position and returns the best move and evaluation.
 * Supports MultiPV to find secondary best moves for "Great" move detection.
 * Evaluation is always normalized to White's perspective (positive = White advantage).
 */
export const getStockfishEvaluation = async (fen: string, depth: number = 15, multiPV: number = 1): Promise<StockfishResult> => {
  const worker = await initWorker();

  return new Promise((resolve, reject) => {
    let bestMove = '';
    let currentDepth = 0;
    
    // Store lines by MultiPV ID (1-based)
    const lines: Record<number, { move: string, eval: number, pv: string }> = {};

    const handler = (e: MessageEvent) => {
      const msg = e.data;
      
      if (typeof msg === 'string') {
        // Parse Evaluation from info string
        // Example: info depth 10 ... multipv 1 ... score cp 50 ... pv e2e4 ...
        if (msg.startsWith('info') && msg.includes('score') && msg.includes('pv')) {
            // Extract Depth
            const parts = msg.split(' ');
            const depthIndex = parts.indexOf('depth');
            if (depthIndex !== -1 && depthIndex + 1 < parts.length) {
                const d = parseInt(parts[depthIndex + 1]);
                if (!isNaN(d)) currentDepth = d;
            }

            // Determine PV index
            let pvId = 1;
            if (msg.includes('multipv')) {
                const idx = parts.indexOf('multipv');
                if (idx !== -1 && idx + 1 < parts.length) {
                    pvId = parseInt(parts[idx + 1]);
                }
            }

            // Parse Score
            let currentEval = 0;
            const scoreIndex = parts.indexOf('score');
            
            if (scoreIndex !== -1 && scoreIndex + 2 < parts.length) {
                const type = parts[scoreIndex + 1]; // 'cp' or 'mate'
                const val = parseInt(parts[scoreIndex + 2]);
                
                if (!isNaN(val)) {
                    if (type === 'mate') {
                        // Mate score: +/- 10000
                        currentEval = val > 0 ? 10000 : -10000;
                    } else {
                        // CP score: convert to pawn units (divide by 100)
                        currentEval = val / 100;
                    }
                }
            }

            // Parse PV (Principal Variation)
            const pvIndex = parts.indexOf('pv');
            if (pvIndex !== -1 && pvIndex + 1 < parts.length) {
                const move = parts[pvIndex + 1];
                // Collect the full line
                const continuation = parts.slice(pvIndex + 1).join(' ');
                lines[pvId] = { move, eval: currentEval, pv: continuation };
            }
        }

        // Parse Best Move (End of search)
        if (msg.startsWith('bestmove')) {
          bestMove = msg.split(' ')[1];
          worker.removeEventListener('message', handler);
          
          // Stockfish "score" is relative to the side to move.
          // We want absolute evaluation (White perspective).
          const turn = fen.split(' ')[1]; // 'w' or 'b'
          const normalize = (val: number) => turn === 'w' ? val : -val;

          const primary = lines[1];
          const secondary = lines[2];
          
          resolve({ 
              bestMove: primary ? primary.move : bestMove, 
              evaluation: primary ? normalize(primary.eval) : 0,
              secondaryMove: secondary ? secondary.move : undefined,
              secondaryEvaluation: secondary ? normalize(secondary.eval) : undefined,
              depth: currentDepth,
              continuation: primary ? primary.pv : ''
          });
        }
      }
    };

    worker.addEventListener('message', handler);
    
    // Commands to start search
    worker.postMessage('stop'); // Stop any previous
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage(`setoption name MultiPV value ${multiPV}`);
    worker.postMessage(`go depth ${depth}`);
  });
};

export const getStockfishMove = async (fen: string, depth: number = 15): Promise<{ bestMove: string, evaluation: number }> => {
    return getStockfishEvaluation(fen, depth, 1);
};

// Helper to calculate material value from FEN
const getMaterialValue = (fen: string): { white: number, black: number } => {
    const pieces = fen.split(' ')[0];
    let white = 0;
    let black = 0;
    const values: Record<string, number> = {
        p: 1, n: 3, b: 3, r: 5, q: 9,
        P: 1, N: 3, B: 3, R: 5, Q: 9
    };
    
    for (const char of pieces) {
        if (values[char] !== undefined) {
            if (char === char.toUpperCase()) white += values[char];
            else black += values[char];
        }
    }
    return { white, black };
};

export const classifyMoveWithStockfish = async (
  prevFen: string,
  currentFen: string,
  moveSan: string,
  color: 'w' | 'b',
  currentEval: StockfishResult,
  moveNumber: number // Ply count
): Promise<string> => {
    // 1. Get Eval for Previous Position with MultiPV to detect "Great" moves (forced sequences)
    const prevEval = await getStockfishEvaluation(prevFen, 12, 2); 
    
    const prevScore = color === 'w' ? prevEval.evaluation : -prevEval.evaluation;
    const currScore = color === 'w' ? currentEval.evaluation : -currentEval.evaluation;
    
    const loss = prevScore - currScore;

    // 2. Book Move Heuristic: Early game, balanced, low loss
    if (moveNumber <= 12 && Math.abs(prevScore) < 0.8 && loss < 0.15) {
        return "Book";
    }

    // 3. Mate Logic
    const prevIsMate = Math.abs(prevEval.evaluation) > 9000;
    const currIsMate = Math.abs(currentEval.evaluation) > 9000;
    
    // If we had forced mate and lost it
    if (prevIsMate && prevScore > 0 && !currIsMate) {
        return "Miss"; // Missed mate
    }
    // If we blundered into forced mate
    if (!prevIsMate && currIsMate && currScore < 0) {
        return "Blunder";
    }

    // 4. Missed Win: Clear win (> +2) dropped to Draw/Unclear (< +1)
    if (prevScore > 2.0 && currScore < 1.0) {
        return "Miss";
    }

    // 5. Classification based on Loss
    if (loss <= 0.05) {
        // It's the Best move. Check for Brilliant or Great.
        
        // Brilliant: Sacrifice involved? 
        // Compare material balance. 
        // If (MyMatCurr - OppMatCurr) < (MyMatPrev - OppMatPrev) => I lost value net.
        const matPrev = getMaterialValue(prevFen);
        const matCurr = getMaterialValue(currentFen);
        
        const balPrev = color === 'w' ? matPrev.white - matPrev.black : matPrev.black - matPrev.white;
        const balCurr = color === 'w' ? matCurr.white - matCurr.black : matCurr.black - matCurr.white;
        
        if (balCurr < balPrev - 1) { // Sacrificed at least 2 points (or 1+ context)
             return "Brilliant";
        }

        // Great: Unique best move
        if (prevEval.secondaryEvaluation !== undefined) {
             const secondScore = color === 'w' ? prevEval.secondaryEvaluation : -prevEval.secondaryEvaluation;
             const diff = prevScore - secondScore;
             // If difference between 1st and 2nd best is significant, and we found the 1st
             if (diff > 1.5) {
                 return "Great";
             }
        }
        
        return "Best";
    }
    
    if (loss <= 0.25) return "Excellent";
    if (loss <= 0.60) return "Good";
    if (loss <= 1.20) return "Inaccuracy";
    if (loss <= 2.50) return "Mistake";
    
    return "Blunder";
};

export const terminateStockfish = () => {
  if (stockfishWorker) {
    stockfishWorker.terminate();
    stockfishWorker = null;
  }
};
