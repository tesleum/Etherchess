import { Chess } from 'chess.js';

// --- Evaluation Constants ---
const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

// Piece Square Tables (White Perspective)
const PST = {
  p: [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5, 10, 25, 25, 10,  5,  5],
    [0,  0,  0, 20, 20,  0,  0,  0],
    [5, -5,-10,  0,  0,-10, -5,  5],
    [5, 10, 10,-20,-20, 10, 10,  5],
    [0,  0,  0,  0,  0,  0,  0,  0]
  ],
  n: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  b: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
  ],
  r: [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [0,  0,  0,  5,  5,  0,  0,  0]
  ],
  q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [-5,  0,  5,  5,  5,  5,  0, -5],
    [0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20]
  ],
  k: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [20, 20,  0,  0,  0,  0, 20, 20],
    [20, 30, 10,  0,  0, 10, 30, 20]
  ]
};

// --- Evaluation Function ---
export const evaluateBoard = (game: Chess): number => {
    if (game.isCheckmate()) return game.turn() === 'w' ? -Infinity : Infinity;
    if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition()) return 0;

    let score = 0;
    const board = game.board();

    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const piece = board[i][j];
            if (piece) {
                const isWhite = piece.color === 'w';
                let val = PIECE_VALUES[piece.type];
                
                // Position Bonus
                let pstVal = 0;
                if (PST[piece.type as keyof typeof PST]) {
                   const table = PST[piece.type as keyof typeof PST];
                   pstVal = isWhite ? table[i][j] : table[7-i][j];
                }

                score += isWhite ? (val + pstVal) : -(val + pstVal);
            }
        }
    }
    return score;
};

// --- Heuristic Status Generator ---
export const getGameStatus = (game: Chess, evaluation: number): { strategy: string, threats: string } => {
    const turn = game.turn() === 'w' ? 'White' : 'Black';
    const other = game.turn() === 'w' ? 'Black' : 'White';
    let strategy = "";
    let threats = "";

    // Strategy based on evaluation (evaluation is from white's perspective usually, but here we expect 'evaluation' to be + for white, - for black)
    // Adjust logic if evaluation is always passed as 'white relative'.
    // Assuming evaluation is White's advantage.
    
    const isAdvantage = (game.turn() === 'w' && evaluation > 0.5) || (game.turn() === 'b' && evaluation < -0.5);
    const isDisadvantage = (game.turn() === 'w' && evaluation < -0.5) || (game.turn() === 'b' && evaluation > 0.5);

    if (Math.abs(evaluation) <= 0.5) {
        strategy = `The position is balanced. ${turn} should focus on piece activity, controlling the center (d4/d5/e4/e5), and king safety.`;
    } else if (isAdvantage) {
        strategy = `${turn} has a slight advantage. Look for opportunities to exchange pieces to simplify into a winning endgame or press the attack.`;
    } else {
        strategy = `${turn} is under pressure. Focus on solid defense, avoid creating weaknesses, and look for tactical counterplay.`;
    }

    // Threats based on game state
    if (game.isCheck()) {
        threats = `⚠️ CHECK: ${turn}'s King is under attack! You must move the King, capture the attacker, or block the line of fire immediately.`;
    } else if (isDisadvantage) {
         threats = `Positional Disadvantage: ${other} has better piece placement or material. Be careful of tactical strikes.`;
    } else {
        threats = `Monitor diagonals and files. Watch out for ${other}'s knights and bishops entering your territory.`;
    }

    return { strategy, threats };
}

// --- Minimax AI ---
export const getMinimaxMove = (game: Chess, depth: number = 3): string | null => {
    let bestMove = null;
    const isMaximizing = game.turn() === 'w';
    
    // Sort moves to improve pruning (captures first)
    const moves = game.moves().sort((a, b) => {
        if (a.includes('x') && !b.includes('x')) return -1;
        if (!a.includes('x') && b.includes('x')) return 1;
        return 0;
    });
    
    if (moves.length === 0) return null;

    let bestValue = isMaximizing ? -Infinity : Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    for (const move of moves) {
        game.move(move);
        const value = minimax(game, depth - 1, alpha, beta, !isMaximizing);
        game.undo();

        if (isMaximizing) {
            if (value > bestValue) {
                bestValue = value;
                bestMove = move;
            }
            alpha = Math.max(alpha, bestValue);
        } else {
            if (value < bestValue) {
                bestValue = value;
                bestMove = move;
            }
            beta = Math.min(beta, bestValue);
        }
        
        if (beta <= alpha) break;
    }
    
    // Fallback if null (shouldn't happen if moves exist)
    return bestMove || moves[0];
};

const minimax = (game: Chess, depth: number, alpha: number, beta: number, isMaximizing: boolean): number => {
    if (depth === 0) return evaluateBoard(game);

    // Game over check
    if (game.isGameOver()) return evaluateBoard(game);

    const moves = game.moves();
    if (moves.length === 0) return evaluateBoard(game);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            game.move(move);
            const evaluation = minimax(game, depth - 1, alpha, beta, false);
            game.undo();
            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            game.move(move);
            const evaluation = minimax(game, depth - 1, alpha, beta, true);
            game.undo();
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return minEval;
    }
};