
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chess, Move, Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { LiquidCard, LiquidButton, LiquidBadge } from './LiquidUI';
import { Target, BookOpen, Brain, Zap, ArrowLeft, RefreshCw, CheckCircle2, XCircle, Lightbulb, Trophy, ChevronRight, Activity, Play, List, Crown } from 'lucide-react';
import { getStockfishMove } from '../services/stockfishService';

// --- Types ---
type TrainingMode = 'hub' | 'tactics' | 'openings' | 'endgames';

// --- TACTICS DATA ---
interface Puzzle {
    id: string;
    fen: string;
    solution: string[]; // SAN sequence
    description: string;
    title: string;
    rating: number;
    color: 'w' | 'b';
}

const REAL_PUZZLES: Puzzle[] = [
    {
        id: 'p1',
        title: "Scholar's Mate Pattern",
        description: "White to move. Spot the immediate checkmate on f7.",
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        solution: ["Qxf7#"],
        rating: 600,
        color: 'w'
    },
    {
        id: 'p2',
        title: "Back Rank Weakness",
        description: "White to move. Capitalize on the opponent's weak back rank.",
        fen: "6k1/3R1ppp/8/8/8/8/5PPP/6K1 w - - 0 1",
        solution: ["Rd8#"],
        rating: 800,
        color: 'w'
    },
    {
        id: 'p3',
        title: "Smothered Mate",
        description: "White to move. The king is trapped by his own pieces.",
        fen: "r1b3kr/ppp1B1pp/2nb4/3N4/2Bp4/8/PPP2PPP/R2K3R w - - 0 1",
        solution: ["Nf6#"],
        rating: 1500,
        color: 'w'
    },
    {
        id: 'p4',
        title: "Queen Deflection",
        description: "Black to move. Deflect the defender to deliver mate.",
        fen: "3r2k1/5ppp/8/8/8/8/1Q6/K2q4 b - - 0 1", 
        solution: ["Qa4+", "Kb1", "Rd1#"],
        rating: 1000,
        color: 'b'
    },
    {
        id: 'p5',
        title: "Classic Bishop Sacrifice",
        description: "White to move. Bxh7+ has already happened. Finish the attack.",
        fen: "r1bq1rk1/ppp2pp1/2n2n2/4p1N1/1bBP4/2N5/PP3PPP/R1BQR1K1 w - - 1 11", 
        solution: ["Qh5"], 
        rating: 1400,
        color: 'w'
    }
];

// --- OPENINGS DATA ---
interface Opening {
    id: string;
    name: string;
    eco: string;
    moves: string[]; // Main line moves in SAN
    description: string;
    difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
    orientation: 'white' | 'black';
}

const OPENING_DATABASE: Opening[] = [
    {
        id: 'italian',
        name: 'Italian Game',
        eco: 'C50',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
        description: "One of the oldest openings. White develops the bishop to c4 to control the center and eye the weak f7 square.",
        difficulty: 'Beginner',
        orientation: 'white'
    },
    {
        id: 'sicilian',
        name: 'Sicilian Defense',
        eco: 'B20',
        moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
        description: "The most popular response to e4. Black fights for the center from the flank (c-file), leading to sharp, tactical games.",
        difficulty: 'Advanced',
        orientation: 'black'
    },
    {
        id: 'queens_gambit',
        name: "Queen's Gambit",
        eco: 'D06',
        moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'],
        description: "White sacrifices the c-pawn to gain better control of the center. A solid and strategic choice.",
        difficulty: 'Intermediate',
        orientation: 'white'
    },
    {
        id: 'ruy_lopez',
        name: 'Ruy Lopez',
        eco: 'C60',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'],
        description: "Also known as the Spanish Game. White puts pressure on the knight defending the e5 pawn.",
        difficulty: 'Intermediate',
        orientation: 'white'
    },
    {
        id: 'french',
        name: 'French Defense',
        eco: 'C00',
        moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'],
        description: "A solid defense where Black fights for the center with pawns, often leading to closed, strategic positions.",
        difficulty: 'Intermediate',
        orientation: 'black'
    },
    {
        id: 'london',
        name: 'London System',
        eco: 'D02',
        moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'c5', 'e3', 'Nc6'],
        description: "A system opening where White develops pieces to the same squares almost regardless of what Black plays.",
        difficulty: 'Beginner',
        orientation: 'white'
    }
];

// --- ENDGAMES DATA ---
interface EndgameScenario {
    id: string;
    title: string;
    description: string;
    fen: string;
    difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
    goal: 'Win' | 'Draw';
    turn: 'w' | 'b';
}

const ENDGAME_SCENARIOS: EndgameScenario[] = [
    {
        id: 'kq_vs_k',
        title: 'King & Queen vs King',
        description: 'The most basic checkmate. Use your Queen to restrict the enemy King to the edge of the board, then bring your King to help deliver checkmate.',
        fen: '8/8/8/4k3/8/8/Q7/K7 w - - 0 1',
        difficulty: 'Beginner',
        goal: 'Win',
        turn: 'w'
    },
    {
        id: 'kr_vs_k',
        title: 'King & Rook vs King',
        description: 'Slightly harder than K+Q. You must use your King and Rook together to force the enemy King to the edge (box method).',
        fen: '8/8/8/4k3/8/8/R7/K7 w - - 0 1',
        difficulty: 'Intermediate',
        goal: 'Win',
        turn: 'w'
    },
    {
        id: 'kp_vs_k',
        title: 'King & Pawn vs King',
        description: 'The fundamentals of pawn promotion. Use opposition to escort your pawn to the promotion square.',
        fen: '8/8/8/8/4k3/8/4P3/4K3 w - - 0 1',
        difficulty: 'Intermediate',
        goal: 'Win',
        turn: 'w'
    },
    {
        id: 'lucena',
        title: 'Lucena Position',
        description: 'The key to winning rook endgames. Build a "bridge" with your rook to shield your king from checks.',
        fen: '1K1k4/1P6/8/8/8/8/r7/5R2 w - - 0 1',
        difficulty: 'Advanced',
        goal: 'Win',
        turn: 'w'
    },
    {
        id: 'philidor',
        title: 'Philidor Position',
        description: 'The most important drawing technique in rook endgames. Keep your rook active on the 6th rank.',
        fen: '3r4/8/8/8/3k4/8/2P5/2K1R3 b - - 0 1',
        difficulty: 'Advanced',
        goal: 'Draw',
        turn: 'b'
    }
];

// --- COMPONENT: TACTICS TRAINER ---
const TacticsTrainer = ({ onBack }: { onBack: () => void }) => {
    const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
    const [game, setGame] = useState(new Chess());
    const [puzzleState, setPuzzleState] = useState<'solving' | 'correct' | 'incorrect'>('solving');
    const [solutionStep, setSolutionStep] = useState(0);
    const [hintUsed, setHintUsed] = useState(false);
    const [userRating, setUserRating] = useState(1200);
    const [hintArrows, setHintArrows] = useState<[string, string][]>([]);
    const [isHintLoading, setIsHintLoading] = useState(false);

    const puzzle = REAL_PUZZLES[currentPuzzleIndex];

    useEffect(() => {
        const g = new Chess();
        try { g.load(puzzle.fen); } catch(e) { console.error("Invalid FEN"); }
        setGame(g);
        setPuzzleState('solving');
        setSolutionStep(0);
        setHintUsed(false);
        setHintArrows([]);
    }, [currentPuzzleIndex]);

    const handleMove = (source: Square, target: Square) => {
        if (puzzleState !== 'solving') return false;
        const g = new Chess(game.fen());
        try {
            const move = g.move({ from: source, to: target, promotion: 'q' });
            if (!move) return false;
            setHintArrows([]);

            const expectedSan = puzzle.solution[solutionStep];
            if (move.san === expectedSan || (g.isCheckmate() && expectedSan?.includes('#'))) {
                setGame(g);
                if (solutionStep + 1 >= puzzle.solution.length) {
                    setPuzzleState('correct');
                    setUserRating(prev => prev + (hintUsed ? 5 : 10));
                    return true;
                }
                setSolutionStep(prev => prev + 1);
                
                if (solutionStep + 1 < puzzle.solution.length) {
                     setTimeout(async () => {
                         const nextMoveSan = puzzle.solution[solutionStep + 1];
                         if (nextMoveSan) {
                             const g2 = new Chess(g.fen());
                             g2.move(nextMoveSan);
                             setGame(g2);
                             setSolutionStep(prev => prev + 1);
                         }
                     }, 400);
                }
                return true;
            } else {
                setPuzzleState('incorrect');
                setTimeout(() => {
                    setPuzzleState('solving'); 
                    setGame(new Chess(game.fen())); 
                }, 800);
                return false;
            }
        } catch (e) { return false; }
    };

    const nextPuzzle = () => {
        if (currentPuzzleIndex + 1 < REAL_PUZZLES.length) setCurrentPuzzleIndex(prev => prev + 1);
        else setCurrentPuzzleIndex(0); 
    };

    const retry = () => {
        const g = new Chess();
        g.load(puzzle.fen);
        setGame(g);
        setPuzzleState('solving');
        setSolutionStep(0);
        setHintArrows([]);
    };

    const requestHint = async () => {
        if (isHintLoading || puzzleState !== 'solving') return;
        setIsHintLoading(true);
        try {
            const result = await getStockfishMove(game.fen(), 15);
            if (result.bestMove) {
                const from = result.bestMove.substring(0, 2);
                const to = result.bestMove.substring(2, 4);
                setHintArrows([[from, to]]);
                setHintUsed(true);
            }
        } catch (e) { console.error("Hint failed", e); } 
        finally { setIsHintLoading(false); }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full animate-in slide-in-from-right-4 duration-500">
            <div className="w-full lg:w-2/3 flex flex-col items-center justify-center">
                 <div className="w-full max-w-[600px] mb-4 flex justify-between items-center">
                    <button onClick={onBack} className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft size={16} className="mr-1"/> Exit
                    </button>
                    <div className="flex items-center gap-2">
                         <div className={`px-3 py-1 rounded-full text-xs font-bold border ${puzzle.color === 'w' ? 'bg-white text-black border-gray-300' : 'bg-black text-white border-gray-700'}`}>
                             {puzzle.color === 'w' ? 'White to Move' : 'Black to Move'}
                         </div>
                         <LiquidBadge color="bg-primary">Rated {puzzle.rating}</LiquidBadge>
                    </div>
                 </div>
                 <LiquidCard className={`p-0 w-full max-w-[600px] aspect-square rounded-sm border-2 overflow-hidden relative shadow-xl transition-all duration-300 ${puzzleState === 'incorrect' ? 'border-destructive' : puzzleState === 'correct' ? 'border-green-500' : 'border-border'}`}>
                    <Chessboard 
                        id="TacticsBoard"
                        {...({
                            position: game.fen(),
                            onPieceDrop: handleMove,
                            boardOrientation: puzzle.color === 'w' ? 'white' : 'black',
                            animationDuration: 200,
                            customDarkSquareStyle: { backgroundColor: '#71717a' },
                            customLightSquareStyle: { backgroundColor: '#e4e4e7' },
                            arePiecesDraggable: puzzleState === 'solving',
                            customArrows: hintArrows,
                            customArrowColor: "rgba(34, 197, 94, 0.8)"
                        } as any)}
                    />
                    {puzzleState === 'correct' && (
                        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center backdrop-blur-[2px] z-10 animate-in fade-in">
                            <div className="bg-background/90 p-6 rounded-xl shadow-2xl text-center border border-green-500/50 transform scale-110">
                                <CheckCircle2 size={48} className="text-green-500 mx-auto mb-2" />
                                <h2 className="text-2xl font-bold text-green-600 mb-1">Solved!</h2>
                                <p className="text-muted-foreground text-sm">{hintUsed ? '+5 (Hint Used)' : '+10 Rating Points'}</p>
                            </div>
                        </div>
                    )}
                 </LiquidCard>
            </div>
            <div className="w-full lg:w-1/3 flex flex-col gap-4">
                 <LiquidCard className="p-6 flex flex-col h-full min-h-[400px]">
                     <div className="mb-6">
                         <h2 className="text-2xl font-bold mb-1 flex items-center gap-2"><Target className="text-primary"/> Tactics</h2>
                         <p className="text-muted-foreground text-sm">Puzzle #{currentPuzzleIndex + 1}</p>
                     </div>
                     <div className="space-y-6 flex-grow">
                         <div className="bg-muted/30 p-4 rounded-lg border border-border">
                             <h3 className="font-bold text-sm mb-2 text-foreground">{puzzle.title}</h3>
                             <p className="text-sm text-muted-foreground leading-relaxed">{puzzle.description}</p>
                         </div>
                         {puzzleState === 'incorrect' && (
                             <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20 flex items-center gap-3 text-destructive animate-in shake">
                                 <XCircle size={20} /> <span className="text-sm font-bold">Incorrect. Try again!</span>
                             </div>
                         )}
                         <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
                             <span className="text-xs font-bold text-muted-foreground uppercase">Your Rating</span>
                             <span className="text-lg font-mono font-bold text-primary">{userRating}</span>
                         </div>
                     </div>
                     <div className="mt-auto space-y-3">
                         {puzzleState === 'correct' ? (
                             <LiquidButton onClick={nextPuzzle} className="w-full justify-center py-6 text-lg">Next Puzzle <ChevronRight size={20} className="ml-2"/></LiquidButton>
                         ) : (
                             <div className="grid grid-cols-2 gap-3">
                                 <LiquidButton variant="secondary" onClick={requestHint} disabled={hintUsed || isHintLoading} className="justify-center">
                                     {isHintLoading ? <Activity size={16} className="animate-spin mr-2"/> : <Lightbulb size={16} className={`mr-2 ${hintUsed ? 'text-yellow-500' : ''}`}/>}
                                     {hintUsed ? 'Hint Shown' : 'Visual Hint'}
                                 </LiquidButton>
                                 <LiquidButton variant="secondary" onClick={retry} className="justify-center"><RefreshCw size={16} className="mr-2"/> Retry</LiquidButton>
                             </div>
                         )}
                     </div>
                 </LiquidCard>
            </div>
        </div>
    );
};

// --- COMPONENT: OPENING TRAINER ---
const OpeningTrainer = ({ onBack }: { onBack: () => void }) => {
    const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
    const [game, setGame] = useState(new Chess());
    const [moveIndex, setMoveIndex] = useState(0);
    const [isWrong, setIsWrong] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    // Initial load when opening is selected
    useEffect(() => {
        if (selectedOpening) {
            setGame(new Chess());
            setMoveIndex(0);
            setIsWrong(false);
            setIsComplete(false);
            
            // If user plays Black, CPU (White) plays first move
            if (selectedOpening.orientation === 'black') {
                setTimeout(() => playNextBookMove(new Chess(), 0), 500);
            }
        }
    }, [selectedOpening]);

    const playNextBookMove = (currentGame: Chess, currentIndex: number) => {
        if (!selectedOpening) return;
        
        // If index is out of bounds, we are done
        if (currentIndex >= selectedOpening.moves.length) {
            setIsComplete(true);
            return;
        }

        const nextMoveSan = selectedOpening.moves[currentIndex];
        
        try {
            const result = currentGame.move(nextMoveSan);
            if (result) {
                const newGame = new Chess(currentGame.fen());
                setGame(newGame);
                setMoveIndex(currentIndex + 1);
                
                // If we just played, check if we finished
                if (currentIndex + 1 >= selectedOpening.moves.length) {
                    setIsComplete(true);
                }
            }
        } catch (e) {
            console.error("Bot failed to play move:", nextMoveSan);
        }
    };

    const handleMove = (source: Square, target: Square) => {
        if (!selectedOpening || isComplete) return false;
        
        // Prevent moving out of turn
        const isWhiteTurn = game.turn() === 'w';
        if ((selectedOpening.orientation === 'white' && !isWhiteTurn) || 
            (selectedOpening.orientation === 'black' && isWhiteTurn)) {
            return false;
        }

        const g = new Chess(game.fen());
        try {
            const move = g.move({ from: source, to: target, promotion: 'q' });
            if (!move) return false;

            // Validate against Book Move
            const expectedMove = selectedOpening.moves[moveIndex];
            
            if (move.san === expectedMove) {
                setGame(g);
                setMoveIndex(prev => prev + 1);
                setIsWrong(false);

                // Trigger Opponent Response
                if (moveIndex + 1 < selectedOpening.moves.length) {
                    setTimeout(() => {
                        const nextG = new Chess(g.fen());
                        playNextBookMove(nextG, moveIndex + 1);
                    }, 500);
                } else {
                    setIsComplete(true);
                }
                return true;
            } else {
                setIsWrong(true);
                setTimeout(() => {
                    const resetG = new Chess(game.fen()); // Revert board state
                    setGame(resetG);
                    setIsWrong(false);
                }, 400);
                return false;
            }
        } catch (e) { return false; }
    };

    const resetLine = () => {
        if (!selectedOpening) return;
        const g = new Chess();
        setGame(g);
        setMoveIndex(0);
        setIsComplete(false);
        setIsWrong(false);
        if (selectedOpening.orientation === 'black') {
            setTimeout(() => playNextBookMove(new Chess(), 0), 500);
        }
    };

    if (!selectedOpening) {
        return (
            <div className="h-full flex flex-col animate-in slide-in-from-right-4">
                <div className="mb-6 flex items-center justify-between">
                     <div>
                        <button onClick={onBack} className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
                            <ArrowLeft size={16} className="mr-1"/> Back to Hub
                        </button>
                        <h2 className="text-2xl font-bold">Opening Lab</h2>
                        <p className="text-muted-foreground text-sm">Select an opening line to master.</p>
                     </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-4">
                    {OPENING_DATABASE.map((op) => (
                        <LiquidCard 
                            key={op.id} 
                            className="p-5 cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group flex flex-col"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-sm uppercase ${
                                    op.difficulty === 'Beginner' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                    op.difficulty === 'Intermediate' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                    {op.difficulty}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">{op.eco}</span>
                            </div>
                            <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">{op.name}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-3 mb-4 flex-grow">{op.description}</p>
                            
                            <div className="mt-auto">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={`w-3 h-3 rounded-full border ${op.orientation === 'white' ? 'bg-white border-gray-300' : 'bg-black border-gray-600'}`}></div>
                                    <span className="text-xs font-medium">Play as {op.orientation === 'white' ? 'White' : 'Black'}</span>
                                </div>
                                <LiquidButton onClick={() => setSelectedOpening(op)} variant="secondary" className="w-full h-8 text-xs">
                                    Start Practice
                                </LiquidButton>
                            </div>
                        </LiquidCard>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full animate-in slide-in-from-right-4 duration-500">
             {/* Board */}
             <div className="w-full lg:w-2/3 flex flex-col items-center justify-center">
                 <div className="w-full max-w-[600px] mb-4 flex justify-between items-center">
                    <button onClick={() => setSelectedOpening(null)} className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft size={16} className="mr-1"/> Openings List
                    </button>
                    <LiquidBadge color="bg-secondary">{selectedOpening.name} ({selectedOpening.eco})</LiquidBadge>
                 </div>
                 
                 <LiquidCard className={`p-0 w-full max-w-[600px] aspect-square rounded-sm border-2 overflow-hidden relative shadow-xl transition-all duration-300 ${isWrong ? 'border-destructive' : isComplete ? 'border-green-500' : 'border-border'}`}>
                    <Chessboard 
                        id="OpeningBoard"
                        {...({
                            position: game.fen(), 
                            onPieceDrop: handleMove,
                            boardOrientation: selectedOpening.orientation,
                            animationDuration: 200,
                            customDarkSquareStyle: { backgroundColor: '#71717a' },
                            customLightSquareStyle: { backgroundColor: '#e4e4e7' }
                        } as any)}
                    />
                    {isComplete && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center backdrop-blur-sm z-10 animate-in fade-in">
                            <div className="text-center p-6">
                                <CheckCircle2 size={56} className="text-green-500 mx-auto mb-4" />
                                <h2 className="text-2xl font-bold mb-2">Line Completed!</h2>
                                <p className="text-muted-foreground mb-6">You've mastered the main line of the {selectedOpening.name}.</p>
                                <div className="flex gap-3 justify-center">
                                    <LiquidButton onClick={resetLine} variant="secondary">Practice Again</LiquidButton>
                                    <LiquidButton onClick={() => setSelectedOpening(null)} variant="primary">Next Opening</LiquidButton>
                                </div>
                            </div>
                        </div>
                    )}
                 </LiquidCard>
             </div>

             {/* Sidebar */}
             <div className="w-full lg:w-1/3 flex flex-col gap-4">
                 <LiquidCard className="p-6 flex flex-col h-full min-h-[400px]">
                     <div className="mb-4">
                         <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                             <BookOpen className="text-primary" size={20}/> Theory
                         </h2>
                         <p className="text-sm text-muted-foreground">{selectedOpening.description}</p>
                     </div>

                     <div className="flex-grow">
                         <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                             <List size={12}/> Main Line
                         </h3>
                         <div className="flex flex-wrap gap-2">
                             {selectedOpening.moves.map((m, idx) => (
                                 <div 
                                    key={idx}
                                    className={`px-2 py-1 rounded text-xs font-mono font-medium transition-colors ${
                                        idx < moveIndex 
                                            ? 'bg-primary text-primary-foreground' 
                                            : idx === moveIndex 
                                                ? 'bg-accent text-accent-foreground border border-primary animate-pulse'
                                                : 'bg-muted text-muted-foreground'
                                    }`}
                                 >
                                     {Math.floor(idx/2) + 1}.{idx % 2 !== 0 ? '..' : ''} {m}
                                 </div>
                             ))}
                         </div>

                         {isWrong && (
                             <div className="mt-6 bg-destructive/10 text-destructive p-3 rounded-md text-sm font-bold flex items-center gap-2 animate-in shake">
                                 <XCircle size={16}/> Wrong move. Follow the book!
                             </div>
                         )}
                     </div>
                     
                     <div className="mt-auto pt-6 border-t border-border">
                        <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
                             <span>Progress</span>
                             <span>{Math.round((moveIndex / selectedOpening.moves.length) * 100)}%</span>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-primary transition-all duration-300 ease-out"
                                style={{ width: `${(moveIndex / selectedOpening.moves.length) * 100}%` }}
                            ></div>
                        </div>
                        <LiquidButton onClick={resetLine} variant="secondary" className="w-full mt-4 h-8 text-xs">
                             <RefreshCw size={12} className="mr-2"/> Restart Line
                        </LiquidButton>
                     </div>
                 </LiquidCard>
             </div>
        </div>
    );
};

// --- COMPONENT: ENDGAME TRAINER ---
const EndgameTrainer = ({ onBack }: { onBack: () => void }) => {
    const [selectedScenario, setSelectedScenario] = useState<EndgameScenario | null>(null);
    const [game, setGame] = useState(new Chess());
    const [gameStatus, setGameStatus] = useState<'playing' | 'win' | 'loss' | 'draw'>('playing');
    const [aiThinking, setAiThinking] = useState(false);

    useEffect(() => {
        if (selectedScenario) {
            const g = new Chess(selectedScenario.fen);
            setGame(g);
            setGameStatus('playing');
            setAiThinking(false);
            
            // If AI (opponent) is White and it's their turn
            if (selectedScenario.turn === 'b' && g.turn() === 'w') {
                triggerAiMove(g);
            }
        }
    }, [selectedScenario]);

    const triggerAiMove = async (currentGame: Chess) => {
        setAiThinking(true);
        try {
            // Using a decent depth for endgame precision
            const { bestMove } = await getStockfishMove(currentGame.fen(), 15);
            if (bestMove) {
                 const from = bestMove.substring(0, 2);
                 const to = bestMove.substring(2, 4);
                 const promotion = bestMove.length > 4 ? bestMove.substring(4, 5) : 'q';
                 
                 const g = new Chess(currentGame.fen());
                 g.move({ from, to, promotion });
                 setGame(g);
                 checkGameEnd(g);
            }
        } catch(e) { console.error("AI Move failed", e); }
        finally { setAiThinking(false); }
    };

    const handleMove = (source: Square, target: Square) => {
        if (gameStatus !== 'playing' || aiThinking) return false;
        
        // Prevent moving out of turn
        if (game.turn() !== selectedScenario?.turn) return false;

        const g = new Chess(game.fen());
        try {
            const move = g.move({ from: source, to: target, promotion: 'q' });
            if (!move) return false;
            
            setGame(g);
            const isEnded = checkGameEnd(g);
            
            if (!isEnded) {
                setTimeout(() => triggerAiMove(g), 500);
            }
            return true;
        } catch (e) { return false; }
    };

    const checkGameEnd = (g: Chess) => {
        if (g.isGameOver()) {
            if (g.isCheckmate()) {
                // If it was MY turn and I got checkmated -> Loss. 
                // If it was AI turn and I checkmated them -> Win.
                const winner = g.turn() === 'w' ? 'black' : 'white';
                const playerColor = selectedScenario?.turn === 'w' ? 'white' : 'black';
                
                if (winner === playerColor) setGameStatus('win');
                else setGameStatus('loss');
            } else {
                // Draw conditions
                setGameStatus(selectedScenario?.goal === 'Draw' ? 'win' : 'draw');
            }
            return true;
        }
        return false;
    };

    const resetScenario = () => {
        if (selectedScenario) {
            setGame(new Chess(selectedScenario.fen));
            setGameStatus('playing');
            setAiThinking(false);
             if (selectedScenario.turn === 'b' && new Chess(selectedScenario.fen).turn() === 'w') {
                triggerAiMove(new Chess(selectedScenario.fen));
            }
        }
    };

    if (!selectedScenario) {
        return (
            <div className="h-full flex flex-col animate-in slide-in-from-right-4">
                <div className="mb-6 flex items-center justify-between">
                     <div>
                        <button onClick={onBack} className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
                            <ArrowLeft size={16} className="mr-1"/> Back to Hub
                        </button>
                        <h2 className="text-2xl font-bold">Endgame Drills</h2>
                        <p className="text-muted-foreground text-sm">Master essential endgame patterns vs Engine.</p>
                     </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-4">
                    {ENDGAME_SCENARIOS.map((sc) => (
                        <LiquidCard 
                            key={sc.id} 
                            className="p-5 cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group flex flex-col"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-sm uppercase ${
                                    sc.difficulty === 'Beginner' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                    sc.difficulty === 'Intermediate' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                    {sc.difficulty}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-sm uppercase border ${sc.goal === 'Win' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                                    Goal: {sc.goal}
                                </span>
                            </div>
                            <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">{sc.title}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-3 mb-4 flex-grow">{sc.description}</p>
                            
                            <div className="mt-auto">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={`w-3 h-3 rounded-full border ${sc.turn === 'w' ? 'bg-white border-gray-300' : 'bg-black border-gray-600'}`}></div>
                                    <span className="text-xs font-medium">You play {sc.turn === 'w' ? 'White' : 'Black'}</span>
                                </div>
                                <LiquidButton onClick={() => setSelectedScenario(sc)} variant="secondary" className="w-full h-8 text-xs">
                                    Start Drill
                                </LiquidButton>
                            </div>
                        </LiquidCard>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full animate-in slide-in-from-right-4 duration-500">
             <div className="w-full lg:w-2/3 flex flex-col items-center justify-center">
                 <div className="w-full max-w-[600px] mb-4 flex justify-between items-center">
                    <button onClick={() => setSelectedScenario(null)} className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft size={16} className="mr-1"/> All Drills
                    </button>
                    <LiquidBadge color="bg-secondary">{selectedScenario.title}</LiquidBadge>
                 </div>
                 
                 <LiquidCard className={`p-0 w-full max-w-[600px] aspect-square rounded-sm border-2 overflow-hidden relative shadow-xl transition-all duration-300 ${gameStatus === 'loss' ? 'border-destructive' : gameStatus === 'win' ? 'border-green-500' : 'border-border'}`}>
                    <Chessboard 
                        id="EndgameBoard"
                        {...({
                            position: game.fen(),
                            onPieceDrop: handleMove,
                            boardOrientation: selectedScenario.turn === 'w' ? 'white' : 'black',
                            animationDuration: 200,
                            arePiecesDraggable: gameStatus === 'playing' && !aiThinking,
                            customDarkSquareStyle: { backgroundColor: '#71717a' },
                            customLightSquareStyle: { backgroundColor: '#e4e4e7' }
                        } as any)}
                    />
                    
                    {gameStatus !== 'playing' && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center backdrop-blur-sm z-10 animate-in fade-in">
                            <div className="text-center p-6 bg-card border border-border rounded-xl shadow-2xl">
                                {gameStatus === 'win' ? (
                                    <>
                                        <CheckCircle2 size={56} className="text-green-500 mx-auto mb-4" />
                                        <h2 className="text-2xl font-bold mb-2">Drill Complete!</h2>
                                        <p className="text-muted-foreground mb-6">You successfully achieved the goal.</p>
                                    </>
                                ) : gameStatus === 'draw' ? (
                                    <>
                                        <Activity size={56} className="text-orange-500 mx-auto mb-4" />
                                        <h2 className="text-2xl font-bold mb-2">Draw</h2>
                                        <p className="text-muted-foreground mb-6">Ideally you should checkmate, but a draw is safe.</p>
                                    </>
                                ) : (
                                    <>
                                        <XCircle size={56} className="text-destructive mx-auto mb-4" />
                                        <h2 className="text-2xl font-bold mb-2">Failed</h2>
                                        <p className="text-muted-foreground mb-6">The opponent outplayed you. Try again.</p>
                                    </>
                                )}
                                <div className="flex gap-3 justify-center">
                                    <LiquidButton onClick={resetScenario} variant="secondary">Retry</LiquidButton>
                                    <LiquidButton onClick={() => setSelectedScenario(null)} variant="primary">Next Drill</LiquidButton>
                                </div>
                            </div>
                        </div>
                    )}
                 </LiquidCard>
             </div>

             <div className="w-full lg:w-1/3 flex flex-col gap-4">
                 <LiquidCard className="p-6 flex flex-col h-full min-h-[400px]">
                     <div className="mb-4">
                         <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                             <Crown className="text-primary" size={20}/> Objective
                         </h2>
                         <p className="text-sm text-muted-foreground">{selectedScenario.description}</p>
                     </div>

                     <div className="flex-grow space-y-4">
                        <div className="bg-muted/30 p-4 rounded-lg border border-border">
                            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Target Result</h3>
                            <div className={`text-2xl font-bold ${selectedScenario.goal === 'Win' ? 'text-green-600' : 'text-orange-500'}`}>
                                {selectedScenario.goal}
                            </div>
                        </div>
                        
                        <div className="bg-muted/30 p-4 rounded-lg border border-border">
                            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Opponent</h3>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center">
                                    <Brain size={16} />
                                </div>
                                <div>
                                    <div className="text-sm font-bold">Stockfish 18</div>
                                    <div className="text-[10px] text-muted-foreground">Level: Grandmaster</div>
                                </div>
                            </div>
                        </div>

                        {aiThinking && (
                             <div className="flex items-center justify-center gap-2 py-4 text-sm text-primary animate-pulse font-bold">
                                 <Activity size={16} /> Engine is calculating...
                             </div>
                        )}
                     </div>
                     
                     <div className="mt-auto pt-6 border-t border-border">
                        <LiquidButton onClick={resetScenario} variant="secondary" className="w-full h-8 text-xs">
                             <RefreshCw size={12} className="mr-2"/> Restart Position
                        </LiquidButton>
                     </div>
                 </LiquidCard>
             </div>
        </div>
    );
};

// --- COMPONENT: TRAINING HUB ---
export const TrainingHub = () => {
    const [activeModule, setActiveModule] = useState<TrainingMode>('hub');

    if (activeModule === 'tactics') {
        return <TacticsTrainer onBack={() => setActiveModule('hub')} />;
    }
    
    if (activeModule === 'openings') {
        return <OpeningTrainer onBack={() => setActiveModule('hub')} />;
    }

    if (activeModule === 'endgames') {
        return <EndgameTrainer onBack={() => setActiveModule('hub')} />;
    }

    return (
        <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
            <div className="col-span-full mb-4">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/50">Training Center</h1>
                <p className="text-muted-foreground">Sharpen your skills with AI-powered exercises.</p>
            </div>
            
            {/* Tactics */}
            <LiquidCard className="p-6 flex flex-col gap-4 hover:border-primary/50 transition-colors cursor-pointer group min-h-[250px]">
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Target size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold">Tactics Trainer</h3>
                    <p className="text-sm text-muted-foreground mt-1">Solve daily chess puzzles to improve your pattern recognition.</p>
                </div>
                <div className="mt-auto pt-4">
                     <LiquidButton onClick={() => setActiveModule('tactics')} variant="primary" className="w-full">Start Training</LiquidButton>
                </div>
            </LiquidCard>

            {/* Openings */}
            <LiquidCard className="p-6 flex flex-col gap-4 hover:border-primary/50 transition-colors cursor-pointer group min-h-[250px]">
                 <div className="w-12 h-12 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <BookOpen size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold">Opening Lab</h3>
                    <p className="text-sm text-muted-foreground mt-1">Practice and memorize key lines in your favorite openings.</p>
                </div>
                <div className="mt-auto pt-4">
                     <LiquidButton onClick={() => setActiveModule('openings')} variant="primary" className="w-full">Enter Lab</LiquidButton>
                </div>
            </LiquidCard>

             {/* Endgames */}
            <LiquidCard className="p-6 flex flex-col gap-4 hover:border-primary/50 transition-colors cursor-pointer group min-h-[250px]">
                 <div className="w-12 h-12 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Brain size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold">Endgame Drills</h3>
                    <p className="text-sm text-muted-foreground mt-1">Master checkmates, pawn structures, and rook endings.</p>
                </div>
                <div className="mt-auto pt-4">
                     <LiquidButton onClick={() => setActiveModule('endgames')} variant="primary" className="w-full">Start Drills</LiquidButton>
                </div>
            </LiquidCard>

            {/* Coming Soon Section */}
             <div className="col-span-full mt-8 p-8 border border-dashed border-border rounded-lg bg-muted/20 text-center">
                 <Zap className="mx-auto text-muted-foreground mb-2" size={32} />
                 <h3 className="text-lg font-bold text-muted-foreground">More Modes Coming Soon</h3>
                 <p className="text-xs text-muted-foreground/60">AI Sparring and Speed Chess Drills are in development.</p>
             </div>
        </div>
    )
}
