
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Chess, Move, Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ShieldAlert, Target, Lightbulb, RotateCcw, Activity, Globe, Play, Cpu, Bot, Dices, ChevronDown, Check, Percent, User, Award, ClipboardList, Trophy, AlertTriangle, X, Sparkles, Star, ThumbsUp, ThumbsDown, AlertCircle, BookOpen, Search, Layers, GitBranch, Zap, TrendingUp, Users, Send, Database, Swords, Signal, Clock, Flag, Handshake, MessageSquare, BarChart3, FileText, ChevronRight, Languages, Sword } from 'lucide-react';
import { LiquidCard, LiquidButton, LoadingSkeleton, LiquidSwitch, LiquidModal, LiquidBadge } from './LiquidUI';
import { getStockfishEvaluation, classifyMoveWithStockfish } from '../services/stockfishService';
import { getMinimaxMove, getGameStatus } from '../services/chessAI';
import { generateGameReport, generateMatchPreview, generateFastMatchPreview } from '../services/geminiService';
import { saveGame, subscribeToGame, makeOnlineMove, sendChatMessage, getGameChatHistory, resignGame, offerDraw, respondToDraw, getUser, getUserGames } from '../services/firebase';
import { socketService } from '../services/socketService';
import { ChessAnalysis, Theme, ChatMessage, GameReport, MatchPreview, MoveAnalysis } from '../types';
import { OnlinePlayers } from './OnlinePlayers';

type PanelTab = 'analysis' | 'history' | 'chat' | 'report';

const REPORT_LANGUAGES = [
  'English', 'Español', 'Русский', '中文', 'Français', 'Português', 'Deutsch',
  'العربية', 'فارسی', 'Türkçe', 'Indonesia', 'Italiano', '日本語', '한국어',
  'Polski', 'Azərbaycan', 'Svenska', 'Melayu', 'کوردی (Sorani)'
];

const RTL_LANGUAGES = ['العربية', 'فارسی', 'کوردی (Sorani)'];

// --- Sound & Haptics ---
const SOUNDS = {
  move: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_common/default/move-self.mp3'),
  capture: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_common/default/capture.mp3'),
  check: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_common/default/move-check.mp3'),
  castle: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_common/default/castle.mp3'),
  start: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_common/default/game-start.mp3'),
  end: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_common/default/game-end.mp3'),
  illegal: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_common/default/illegal.mp3'),
  message: new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3') // New Message Sound
};

const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning') => {
    if ((window as any).Telegram?.WebApp?.HapticFeedback) {
        const haptic = (window as any).Telegram.WebApp.HapticFeedback;
        switch(type) {
            case 'light': haptic.impactOccurred('light'); break;
            case 'medium': haptic.impactOccurred('medium'); break;
            case 'heavy': haptic.impactOccurred('heavy'); break;
            case 'success': haptic.notificationOccurred('success'); break;
            case 'error': haptic.notificationOccurred('error'); break;
            case 'warning': haptic.notificationOccurred('warning'); break;
        }
    } else if (navigator.vibrate) {
        switch(type) {
            case 'light': navigator.vibrate(10); break;
            case 'medium': navigator.vibrate(20); break;
            case 'heavy': navigator.vibrate(40); break;
            case 'success': navigator.vibrate([50, 50, 50]); break;
            case 'error': navigator.vibrate([50, 100, 50]); break;
            case 'warning': navigator.vibrate([30, 30]); break;
        }
    }
};

const playSound = (type: keyof typeof SOUNDS) => {
    const audio = SOUNDS[type];
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch((e) => console.debug("Audio play blocked", e));
    }
};

const playMoveSound = (move: Move | null, game: Chess) => {
    if (!move) return;
    if (game.isCheckmate()) { playSound('end'); triggerHaptic('success'); }
    else if (game.inCheck()) { playSound('check'); triggerHaptic('heavy'); }
    else if (move.flags.includes('c') || move.flags.includes('e')) { playSound('capture'); triggerHaptic('medium'); }
    else if (move.flags.includes('k') || move.flags.includes('q')) { playSound('castle'); triggerHaptic('light'); }
    else { playSound('move'); triggerHaptic('light'); }
};

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${Math.floor(s).toString().padStart(2, '0')}`;
};

const formatEval = (score: number) => {
    if (score >= 9000) return "MATE (White)";
    if (score <= -9000) return "MATE (Black)";
    const sign = score > 0 ? '+' : '';
    return `${sign}${score.toFixed(2)}`;
};

const getPieceUnicode = (piece: string, color: 'w' | 'b') => {
    if (color === 'w') {
        switch(piece) {
            case 'q': return '♕';
            case 'r': return '♖';
            case 'b': return '♗';
            case 'n': return '♘';
        }
    } else {
        switch(piece) {
            case 'q': return '♛';
            case 'r': return '♜';
            case 'b': return '♝';
            case 'n': return '♞';
        }
    }
    return '';
}

const TIME_CONTROLS = [
  { label: '1 min', value: 60, category: 'Bullet' },
  { label: '3 min', value: 180, category: 'Blitz' },
  { label: '5 min', value: 300, category: 'Blitz' },
  { label: '10 min', value: 600, category: 'Rapid' },
];

interface ChessGameProps {
  theme?: Theme;
  gameToLoad?: { pgn: string } | null;
  currentUser: string;
  onUsernameSubmit: (username: string) => void;
  onlineGameId?: string | null;
  onSpectate?: (gameId: string) => void;
}

export const ChessGame: React.FC<ChessGameProps> = ({ theme = 'dark', gameToLoad, currentUser, onUsernameSubmit, onlineGameId, onSpectate }) => {
  // --- Game State ---
  const [game, setGame] = useState(new Chess());
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<PanelTab>('analysis');
  
  const [gameMode, setGameMode] = useState<'ai' | 'pvp' | 'online'>('ai');
  const [aiLevel, setAiLevel] = useState<number>(3); // 1-5 Difficulty

  const [onlineRole, setOnlineRole] = useState<'w' | 'b' | 'spectator'>('spectator');
  const [onlineNames, setOnlineNames] = useState<{white: string, black: string}>({ white: 'White', black: 'Black' });
  const [avatars, setAvatars] = useState<{ white?: string, black?: string }>({});

  // Player Color State (Randomized for AI)
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  
  // Timers (seconds, float for precision)
  const [timeControl, setTimeControl] = useState<number>(600); // Default 10 min
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const lastTickRef = useRef<number | null>(null);
  
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isModeChangeModalOpen, setIsModeChangeModalOpen] = useState(false);
  const [isTimeChangeModalOpen, setIsTimeChangeModalOpen] = useState(false);
  
  const [pendingMode, setPendingMode] = useState<'ai' | 'pvp' | null>(null);
  const [pendingTimeControl, setPendingTimeControl] = useState<number | null>(null);
  
  const [isLobbyOpen, setIsLobbyOpen] = useState(false);
  
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');

  const [shakeBoard, setShakeBoard] = useState(false);
  const [isCheck, setIsCheck] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<{winner: string, reason: string} | null>(null);
  const [gameSaved, setGameSaved] = useState(false);
  
  const [aiThinking, setAiThinking] = useState(false);

  const [moveFrom, setMoveFrom] = useState('');
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [rightClickedSquares, setRightClickedSquares] = useState<Record<string, React.CSSProperties>>({});

  // Premove State
  const [premove, setPremove] = useState<{ source: Square, target: Square } | null>(null);
  
  // Promotion State
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square, to: Square } | null>(null);

  const [analysis, setAnalysis] = useState<ChessAnalysis | null>(null);
  const [gameReport, setGameReport] = useState<GameReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [moveRatings, setMoveRatings] = useState<Record<number, string>>({});
  
  // Language Modal State
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [reportLanguage, setReportLanguage] = useState<string>('English');

  // New Match Preview State
  const [showMatchStart, setShowMatchStart] = useState(false);
  const [matchPreviewData, setMatchPreviewData] = useState<MatchPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  
  const analysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to track the latest analysis request ID to prevent race conditions
  const analysisIdRef = useRef(0);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastOnlineMoveTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // Online Features
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [incomingDrawOffer, setIncomingDrawOffer] = useState<'w' | 'b' | null>(null);

  const displayedGame = useMemo(() => {
    if (currentMoveIndex === -1) return game;
    const newGame = new Chess();
    const history = game.history();
    for (let i = 0; i <= currentMoveIndex; i++) {
        if (history[i]) newGame.move(history[i]);
    }
    return newGame;
  }, [game, currentMoveIndex]);

  const premoveSquares = useMemo(() => {
    if (!premove) return {};
    return {
      [premove.source]: { backgroundColor: 'rgba(220, 38, 38, 0.5)' },
      [premove.target]: { backgroundColor: 'rgba(220, 38, 38, 0.5)' }
    };
  }, [premove]);

  useEffect(() => {
     if (!currentUser) setIsUsernameModalOpen(true);
     else setIsUsernameModalOpen(false);
  }, [currentUser]);

  useEffect(() => {
      mountedRef.current = true;
      return () => { mountedRef.current = false; };
  }, []);

  // --- FAILSAFE WATCHDOG ---
  useEffect(() => {
      let watchdogTimer: NodeJS.Timeout;
      if (showMatchStart && isPreviewLoading && !matchPreviewData) {
          watchdogTimer = setTimeout(() => {
              console.warn("Analysis Watchdog Triggered: Force loading local preview");
              if (mountedRef.current) {
                  const wName = onlineNames.white || 'White';
                  const bName = onlineNames.black || 'Black';
                  // Fallback to local immediately
                  const fallback = generateFastMatchPreview(wName, bName, [], []);
                  setMatchPreviewData(fallback);
                  setIsPreviewLoading(false);
              }
          }, 4000); // 4 seconds max wait to prevent stuck UI
      }
      return () => clearTimeout(watchdogTimer);
  }, [showMatchStart, isPreviewLoading, matchPreviewData, onlineNames]);

  // Initial AI Color Randomization
  useEffect(() => {
      if (gameMode === 'ai' && game.history().length === 0 && !onlineGameId) {
          const rand = Math.random() > 0.5 ? 'w' : 'b';
          setPlayerColor(rand);
          playSound('start');
      }
  }, []); // Run once on mount

  // Fetch Avatars
  useEffect(() => {
      const loadAvatars = async () => {
          let w = undefined;
          let b = undefined;

          // Helper to get user photo (Local > DB)
          const getPhoto = async (username: string) => {
              if (!username) return undefined;
              // 1. Try Local Storage for current user (Fastest)
              if (username === currentUser) {
                  const local = localStorage.getItem('telegram_photo');
                  if (local) return local;
              }
              // 2. Fetch from Firebase Users (Same source as Leaderboard/Rank Page)
              try {
                  const u = await getUser(username);
                  if (u?.photoUrl) return u.photoUrl;
              } catch (e) { console.error("Avatar fetch error", e); }
              
              return undefined;
          };

          if (gameMode === 'ai') {
              const myPhoto = await getPhoto(currentUser);
              const botPhoto = "https://cdn-icons-png.flaticon.com/512/4712/4712109.png"; 
              
              if (playerColor === 'w') {
                  w = myPhoto;
                  b = botPhoto;
              } else {
                  w = botPhoto;
                  b = myPhoto;
              }
          } else if (gameMode === 'online') {
              // Online Mode - Fetch both to ensure consistency with rank page
              if (onlineNames.white && onlineNames.white !== 'White') {
                  w = await getPhoto(onlineNames.white);
              }
              if (onlineNames.black && onlineNames.black !== 'Black') {
                  b = await getPhoto(onlineNames.black);
              }
          } else {
              // PvP local
              w = await getPhoto(currentUser); 
          }
          
          setAvatars({ white: w, black: b });
      };
      
      loadAvatars();
  }, [gameMode, onlineNames, playerColor, currentUser]);

  // --- PRECISE TIMER LOGIC ---
  useEffect(() => {
      if (isGameOver || currentMoveIndex !== -1) {
          lastTickRef.current = null;
          return;
      }
      
      // Timer does not start until the first move is made
      if (displayedGame.history().length === 0) {
          lastTickRef.current = null;
          return;
      }
      
      // Spectators rely on server updates
      if (gameMode === 'online' && onlineRole === 'spectator') return;

      // Reset tick ref whenever the effect re-runs (turn change, unpause, etc)
      lastTickRef.current = Date.now();

      const interval = setInterval(() => {
          const now = Date.now();
          const delta = now - (lastTickRef.current || now);
          lastTickRef.current = now;
          
          const deltaSeconds = delta / 1000; // Precise float deduction

          if (displayedGame.turn() === 'w') {
              setWhiteTime(prev => {
                  const next = Math.max(0, prev - deltaSeconds);
                  if (next <= 0 && !isGameOver) {
                      setIsGameOver(true);
                      setGameResult({ winner: 'Black', reason: 'Timeout' });
                      playSound('end');
                      return 0;
                  }
                  return next;
              });
          } else {
              setBlackTime(prev => {
                  const next = Math.max(0, prev - deltaSeconds);
                  if (next <= 0 && !isGameOver) {
                      setIsGameOver(true);
                      setGameResult({ winner: 'White', reason: 'Timeout' });
                      playSound('end');
                      return 0;
                  }
                  return next;
              });
          }
      }, 100); // 10Hz updates for smoothness

      return () => clearInterval(interval);
  }, [displayedGame, isGameOver, currentMoveIndex, gameMode, onlineRole]);
  
  useEffect(() => {
      if (onlineGameId) {
          setGameMode('online');
          setActiveTab('chat');
          setGame(new Chess());
          setGameResult(null);
          setIsGameOver(false);
          setGameSaved(false);
          setPremove(null);
          setPendingPromotion(null);
          setGameReport(null);
          setMatchPreviewData(null); // Reset preview
          setShowMatchStart(true); // Show match start modal
          setIsPreviewLoading(true);

          // Reset tracker for sound
          lastOnlineMoveTimeRef.current = 0;
          playSound('start');
          triggerHaptic('success');

          const unsubGame = subscribeToGame(onlineGameId, (onlineData) => {
              // Calculate role locally to avoid stale closure issues in callbacks
              let localRole: 'w' | 'b' | 'spectator' = 'spectator';
              if (currentUser === onlineData.whitePlayer) {
                  localRole = 'w';
              } else if (currentUser === onlineData.blackPlayer) {
                  localRole = 'b';
              }
              
              setOnlineRole(localRole);
              // Spectators view from White perspective by default
              setPlayerColor(localRole === 'b' ? 'b' : 'w');

              setOnlineNames({
                  white: onlineData.whitePlayer || 'White',
                  black: onlineData.blackPlayer || 'Black'
              });

              // --- PRE-GAME ANALYSIS TRIGGER ---
              if (onlineData.whitePlayer && onlineData.blackPlayer && !matchPreviewData && isPreviewLoading) {
                  const fetchPreview = async () => {
                      try {
                          const safeGetGames = async (u: string) => {
                              try { return await getUserGames(u, false); } catch { return []; }
                          };

                          const [wGames, bGames] = await Promise.all([
                              safeGetGames(onlineData.whitePlayer), 
                              safeGetGames(onlineData.blackPlayer)
                          ]);
                          
                          // Use Gemini 3 Flash with timeout race
                          const preview = await generateMatchPreview(onlineData.whitePlayer, onlineData.blackPlayer, wGames, bGames);
                          if (mountedRef.current) {
                              setMatchPreviewData(preview);
                              setIsPreviewLoading(false);
                          }
                      } catch (e) {
                          if (mountedRef.current) {
                               // Fallback on total failure
                               const fallback = generateFastMatchPreview(onlineData.whitePlayer, onlineData.blackPlayer, [], []);
                               setMatchPreviewData(fallback);
                               setIsPreviewLoading(false);
                          }
                      }
                  };
                  // Debounce to prevent double call on fast updates
                  if(analysisIdRef.current === 0) {
                      analysisIdRef.current = 1;
                      fetchPreview();
                  }
              }

              // --- GAME SYNC ---
              const remoteGame = new Chess();
              if (onlineData.pgn) {
                  try { remoteGame.loadPgn(onlineData.pgn); } catch (e) { remoteGame.load(onlineData.fen); }
              } else {
                  remoteGame.load(onlineData.fen);
              }
              
              // Check for new move to play sound (Opponent moves only)
              const remoteHistory = remoteGame.history({ verbose: true });
              const lastMove = remoteHistory[remoteHistory.length - 1];
              
              if (lastMove && onlineData.lastMoveTimestamp) {
                  // If timestamp is newer than what we have seen
                  if (onlineData.lastMoveTimestamp > lastOnlineMoveTimeRef.current) {
                      // Update reference first
                      const isFirstSync = lastOnlineMoveTimeRef.current === 0;
                      lastOnlineMoveTimeRef.current = onlineData.lastMoveTimestamp;
                      
                      // Play sound if:
                      // 1. Not the first sync (avoids sound on page load)
                      // 2. AND (Opponent moved OR Spectator watching)
                      // Note: We handle our own move sound in safeGameMutate for instant feedback
                      if (!isFirstSync) {
                          const isMyMove = (localRole === 'w' && lastMove.color === 'w') || (localRole === 'b' && lastMove.color === 'b');
                          if (!isMyMove || localRole === 'spectator') {
                              playMoveSound(lastMove, remoteGame);
                          }
                      } else {
                          // Initialize ref to current so next moves trigger
                          lastOnlineMoveTimeRef.current = onlineData.lastMoveTimestamp;
                      }
                  }
              }

              setGame(remoteGame);
              
              // --- TIMER SYNC ---
              const tc = onlineData.timeControl || 600;
              setTimeControl(tc);

              // Use snapshot times from DB as source of truth. 
              // We do not calculate elapsed time from timestamps to avoid clock skew issues.
              // The local timer will decrement from these values naturally.
              setWhiteTime(onlineData.whiteTime ?? tc);
              setBlackTime(onlineData.blackTime ?? tc);

              // --- DRAW OFFERS ---
              setIncomingDrawOffer(onlineData.drawOffer || null);
              
              if (onlineData.status === 'completed') {
                  setGameResult({ 
                      winner: onlineData.winner === onlineData.whitePlayer ? 'White' : (onlineData.winner === onlineData.blackPlayer ? 'Black' : 'Draw'), 
                      reason: onlineData.reason || 'Game Completed' 
                  });
                  if (!isGameOver) {
                      playSound('end');
                      triggerHaptic('success');
                  }
                  setIsGameOver(true);
                  setGameSaved(true);
              }
          });
          
          // --- CHAT: HYBRID WS + FIREBASE HISTORY ---
          
          // 1. Load Initial History
          getGameChatHistory(onlineGameId).then(msgs => {
              setChatMessages(msgs);
              if (chatScrollRef.current) {
                  setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
              }
          });

          // 2. Subscribe to WebSocket
          socketService.connect();
          const unsubSocket = socketService.subscribe((data) => {
              if (data.type === 'GAME' && data.gameId === onlineGameId) {
                  const newMessage: ChatMessage = {
                      id: data.id || Date.now().toString(),
                      sender: data.sender,
                      text: data.text,
                      timestamp: data.timestamp
                  };
                  
                  setChatMessages(prev => {
                      // Robust check for duplicates
                      if (prev.some(m => (m.id === newMessage.id) || (m.timestamp === newMessage.timestamp && m.sender === newMessage.sender))) {
                          return prev;
                      }
                      return [...prev, newMessage];
                  });

                  if (data.sender !== currentUser) {
                      playSound('message');
                  }

                  if (chatScrollRef.current) {
                      setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
                  }
              }
          });

          return () => { unsubGame(); unsubSocket(); analysisIdRef.current = 0; };
      }
  }, [onlineGameId, currentUser]);

  useEffect(() => {
    if (gameToLoad && gameToLoad.pgn) {
        try {
            const loadedGame = new Chess();
            loadedGame.loadPgn(gameToLoad.pgn);
            setGame(loadedGame);
            setCurrentMoveIndex(-1);
            setGameMode('pvp');
            setGameSaved(true);
            setGameResult(null);
            setIsGameOver(false);
            setGameReport(null);
            playSound('start');
            performAnalysis(loadedGame.fen(), loadedGame.turn(), true);
        } catch (e) { console.error("Failed to load PGN", e); }
    }
  }, [gameToLoad]);

  const handleUsernameSubmit = () => {
    if (usernameInput.trim()) {
        const u = usernameInput.trim();
        onUsernameSubmit(u);
    }
  };
  
  const handleSendMessage = () => {
      if (!chatInput.trim() || !onlineGameId || !currentUser) return;
      
      const text = chatInput.trim();
      const timestamp = Date.now();
      const id = timestamp.toString() + Math.random().toString();

      const newMessage: ChatMessage = {
          id: id,
          sender: currentUser,
          text: text,
          timestamp: timestamp
      };

      // Optimistic Update
      setChatMessages(prev => [...prev, newMessage]);
      setChatInput('');
      
      if (chatScrollRef.current) {
          setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }), 10);
      }
      
      const msgData = {
          type: 'GAME',
          gameId: onlineGameId,
          sender: currentUser,
          text: text,
          timestamp: timestamp,
          id: id
      };

      // 1. WebSocket for Speed
      socketService.send(msgData as any);
      
      // 2. Firebase for Persistence
      sendChatMessage(onlineGameId, currentUser, text);
  };

  useEffect(() => {
    if (displayedGame.inCheck() && !displayedGame.isGameOver()) {
        setIsCheck(true);
        const timer = setTimeout(() => setIsCheck(false), 2000);
        return () => clearTimeout(timer);
    } else {
        setIsCheck(false);
    }

    if (displayedGame.isGameOver()) {
        setIsGameOver(true);
        let winner = 'Draw';
        let reason = 'Draw';
        let resultHeader = '1/2-1/2';
        
        if (displayedGame.isCheckmate()) {
            winner = displayedGame.turn() === 'w' ? 'Black' : 'White';
            reason = 'Checkmate';
            resultHeader = displayedGame.turn() === 'w' ? '0-1' : '1-0';
        } else if (displayedGame.isDraw()) {
            reason = 'Stalemate / Repetition';
        } else if (displayedGame.isStalemate()) {
            reason = 'Stalemate';
        } else if (displayedGame.isThreefoldRepetition()) {
            reason = 'Repetition';
        } else if (displayedGame.isInsufficientMaterial()) {
            reason = 'Insufficient Material';
        }

        setGameResult({ winner, reason });

        if (!gameSaved && currentMoveIndex === -1 && gameMode !== 'online') {
             // Logic to determine names based on color
             let whiteName = '';
             let blackName = '';
             
             if (gameMode === 'ai') {
                 if (playerColor === 'w') {
                     whiteName = currentUser || 'Anonymous';
                     blackName = `Stockfish (Lvl ${aiLevel})`;
                 } else {
                     whiteName = `Stockfish (Lvl ${aiLevel})`;
                     blackName = currentUser || 'Anonymous';
                 }
             } else {
                 whiteName = currentUser || 'Player 1';
                 blackName = 'Player 2';
             }

             const pgnGame = new Chess();
             const history = game.history();
             for(const move of history) pgnGame.move(move);
             
             pgnGame.header(
                'White', whiteName, 'Black', blackName, 'Result', resultHeader,
                'Date', new Date().toISOString().split('T')[0], 'Event', 'ETHERCHESS AI Game',
             );

             saveGame({
                 fen: displayedGame.fen(),
                 pgn: pgnGame.pgn(),
                 winner,
                 reason,
                 mode: gameMode,
                 whitePlayer: whiteName,
                 blackPlayer: blackName
             });
             setGameSaved(true);
             playSound('end');
             triggerHaptic('success');
        }
    }
  }, [displayedGame, gameMode]);

  useEffect(() => {
    const history = displayedGame.history({ verbose: true });
    if (history.length > 0) {
      const lastMove = history[history.length - 1];
      const moveStyle: React.CSSProperties = {
        backgroundColor: 'rgba(255, 255, 0, 0.4)', // Classic yellow highlight
        animation: 'move-arrival 0.5s ease-out'
      };
      setLastMoveSquares({ [lastMove.from]: moveStyle, [lastMove.to]: moveStyle });
    } else {
      setLastMoveSquares({});
    }
  }, [displayedGame]);

  useEffect(() => {
    if (historyScrollRef.current) {
        if (currentMoveIndex === -1) {
            historyScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
  }, [game.history().length, activeTab, currentMoveIndex]);

  // Perform analysis when board updates
  const performAnalysis = useCallback((currentFen: string, currentTurn: 'w' | 'b', immediate = false, moveIndex = -1) => {
    if (analysisTimeoutRef.current) clearTimeout(analysisTimeoutRef.current);
    
    // Increment analysis ID to invalidate any previous stale runs
    const myAnalysisId = ++analysisIdRef.current;

    const runAnalysis = async () => {
        // Double check ID before starting heavy work
        if (myAnalysisId !== analysisIdRef.current) return;
        
        setIsAnalyzing(true);
        try {
            const history = displayedGame.history({ verbose: true });
            const lastMoveObj = history.length > 0 ? history[history.length - 1] : null;
            const lastMoveSan = lastMoveObj ? lastMoveObj.san : 'N/A';
            
            // Reconstruct previous FEN if we are analyzing a specific move
            let prevFen = '';
            if (moveIndex >= 0) {
                const tempGame = new Chess();
                // We use the full game history to replay up to the moveIndex
                const fullHistory = game.history(); 
                for(let i=0; i<moveIndex; i++) tempGame.move(fullHistory[i]);
                prevFen = tempGame.fen();
            }

            // Depth 15 is a good balance for web responsiveness
            const currentEval = await getStockfishEvaluation(currentFen, 15, 1);
            
            // Check race condition again after await
            if (myAnalysisId !== analysisIdRef.current) return;

            let moveRating = 'Book';
            if (moveIndex >= 0 && lastMoveObj) {
                moveRating = await classifyMoveWithStockfish(prevFen, currentFen, lastMoveSan, lastMoveObj.color, currentEval, moveIndex + 1);
                // Check race condition again
                if (myAnalysisId !== analysisIdRef.current) return;
            }
            
            const winChance = 50 + 50 * (2 / (1 + Math.exp(-0.5 * currentEval.evaluation)) - 1);
            const drawProb = 40 * Math.exp(-0.5 * Math.abs(currentEval.evaluation));
            const wWin = Math.max(0, winChance - drawProb / 2);
            const bWin = Math.max(0, (100 - winChance) - drawProb / 2);
            const dWin = 100 - wWin - bWin;

            const gameStatus = getGameStatus(new Chess(currentFen), currentEval.evaluation);
            const finalResult: ChessAnalysis = {
                strategy: gameStatus.strategy,
                threats: gameStatus.threats,
                evaluation: currentEval.evaluation,
                bestMove: currentEval.bestMove,
                whiteWinningChance: Math.round(wWin),
                drawChance: Math.round(dWin),
                blackWinningChance: Math.round(bWin),
                moveRating: moveRating,
                estimatedElo: 3700,
                depth: currentEval.depth,
                continuation: currentEval.continuation
            };

            setAnalysis(finalResult);
            
            if (moveIndex >= 0) {
                setMoveRatings(prev => ({ ...prev, [moveIndex]: moveRating }));
            }
        } catch (err) { 
            console.error("Analysis Error:", err); 
        } finally { 
            // Only turn off loading if this was the latest request
            if (myAnalysisId === analysisIdRef.current) {
                setIsAnalyzing(false);
            }
        }
    };

    if (immediate) runAnalysis();
    else analysisTimeoutRef.current = setTimeout(runAnalysis, 500); // Reduced debounce time
  }, [displayedGame, game]);

  useEffect(() => {
     if (displayedGame.isGameOver()) return; 

     const history = displayedGame.history();
     const lastMoveIdx = history.length - 1;

     if (lastMoveIdx >= 0) {
         performAnalysis(displayedGame.fen(), displayedGame.turn(), false, lastMoveIdx);
     } else {
         if (history.length === 0) setAnalysis(null);
     }
  }, [displayedGame, performAnalysis]);

  // AI Move Logic (Now supports playing as Black or White)
  useEffect(() => {
    if (currentMoveIndex !== -1) return;
    if (gameMode === 'pvp' || gameMode === 'online') return;
    if (displayedGame.isGameOver() || aiThinking) return;

    // AI plays if it's NOT player's turn
    if (displayedGame.turn() === playerColor) return;

    const makeAIMove = async () => {
      setAiThinking(true);
      await new Promise(r => setTimeout(r, 1000)); 

      let moveSAN: string | null = null;
      try {
         let depth = 8;
         switch(aiLevel) {
             case 1: depth = 1; break; 
             case 2: depth = 5; break; 
             case 3: depth = 10; break; 
             case 4: depth = 15; break; 
             case 5: depth = 20; break; 
         }

         const sf = await getStockfishEvaluation(displayedGame.fen(), depth, 1);
         if (sf.bestMove) {
             const from = sf.bestMove.substring(0, 2);
             const to = sf.bestMove.substring(2, 4);
             const promotion = sf.bestMove.length > 4 ? sf.bestMove.substring(4, 5) : 'q';
             const temp = new Chess(displayedGame.fen());
             const m = temp.move({ from, to, promotion });
             if (m) moveSAN = m.san;
         }
      } catch (e) { console.error("AI Error", e); }

      if (!moveSAN || moveSAN === 'N/A') moveSAN = getMinimaxMove(new Chess(displayedGame.fen()), 2);
      if (!moveSAN) {
        const moves = new Chess(displayedGame.fen()).moves();
        if (moves.length > 0) moveSAN = moves[0];
      }

      if (moveSAN) {
        safeGameMutate((g) => {
            try { return g.move(moveSAN!); } catch { return null; }
        });
      }
      setAiThinking(false);
    };

    makeAIMove();
  }, [gameMode, displayedGame, currentMoveIndex, aiLevel, playerColor]);

  // Premove Execution
  useEffect(() => {
    if (premove && !isGameOver && currentMoveIndex === -1) {
        let isMyTurn = false;
        if (gameMode === 'ai' && displayedGame.turn() === playerColor) isMyTurn = true;
        if (gameMode === 'online' && onlineRole === displayedGame.turn()) isMyTurn = true;
        
        if (isMyTurn) {
            const success = safeGameMutate((g) => g.move({ from: premove.source, to: premove.target, promotion: 'q' }));
            setPremove(null);
            if (!success) {
                setShakeBoard(true);
                setTimeout(() => setShakeBoard(false), 500);
            }
        }
    }
  }, [displayedGame, gameMode, onlineRole, premove, currentMoveIndex, isGameOver, playerColor]);

  const safeGameMutate = (modify: (g: Chess) => Move | null | undefined): boolean => {
      const gameCopy = new Chess();
      try { gameCopy.loadPgn(displayedGame.pgn()); } catch (e) { gameCopy.load(displayedGame.fen()); }

      try {
          const move = modify(gameCopy);
          if (move) {
              setGame(gameCopy); 
              setCurrentMoveIndex(-1); 
              setOptionSquares({});
              setMoveFrom('');
              
              // Play Sound & Haptic for local/AI moves
              playMoveSound(move, gameCopy);

              if (gameMode === 'online' && onlineGameId) {
                  const checkmate = gameCopy.isCheckmate();
                  const gameOver = gameCopy.isGameOver();
                  let winner = null;
                  if (checkmate) winner = gameCopy.turn() === 'w' ? 'Black' : 'White'; 
                  else if (gameOver) winner = 'Draw';
                  
                  // Send current state time to server
                  makeOnlineMove(onlineGameId, gameCopy.fen(), gameCopy.pgn(), move.san, gameOver, winner, whiteTime, blackTime);
                   if (gameOver) {
                       saveGame({
                           fen: gameCopy.fen(), pgn: gameCopy.pgn(),
                           winner: winner === 'White' ? 'White' : (winner === 'Black' ? 'Black' : 'Draw'),
                           reason: 'Game Over', mode: 'Online PvP',
                           whitePlayer: onlineNames.white, blackPlayer: onlineNames.black
                       });
                       setGameSaved(true);
                   }
              }
              return true;
          }
      } catch (e) { return false; }
      return false;
  };

  const finalizePromotion = (pieceType: 'q' | 'r' | 'b' | 'n') => {
      if (!pendingPromotion) return;
      
      const success = safeGameMutate((g) => g.move({ 
          from: pendingPromotion.from, 
          to: pendingPromotion.to, 
          promotion: pieceType 
      }));
      
      setPendingPromotion(null);
      
      if (!success) {
          setShakeBoard(true);
          setTimeout(() => setShakeBoard(false), 500);
      }
  };

  const onDrop = (sourceSquare: Square, targetSquare: Square) => {
    if (gameMode === 'online' && onlineRole === 'spectator') return false;

    // Determine if it is my turn
    let isMyTurn = true;
    if (gameMode === 'ai' && displayedGame.turn() !== playerColor) isMyTurn = false;
    if (gameMode === 'online' && onlineRole !== displayedGame.turn()) isMyTurn = false;
    
    // Check Piece Ownership
    const piece = displayedGame.get(sourceSquare);
    if (gameMode === 'online' && piece && piece.color !== onlineRole) return false;
    if (gameMode === 'ai' && piece && piece.color !== playerColor) return false;

    if (!isMyTurn) {
        if (gameMode !== 'pvp') { 
            setPremove({ source: sourceSquare, target: targetSquare });
            setOptionSquares({});
            setMoveFrom('');
        }
        return false; 
    }

    // Check for Promotion (User is dragging)
    const isPawn = piece?.type === 'p';
    const isPromotionMove = isPawn && (
        (piece.color === 'w' && targetSquare[1] === '8') ||
        (piece.color === 'b' && targetSquare[1] === '1')
    );

    if (isPromotionMove) {
         setPendingPromotion({ from: sourceSquare, to: targetSquare });
         setPremove(null);
         return false; // Don't let board handle it, we will manually trigger modal
    }

    setPremove(null);
    const success = safeGameMutate((g) => g.move({ from: sourceSquare, to: targetSquare, promotion: 'q' }));
    if (!success) {
        setShakeBoard(true);
        setTimeout(() => setShakeBoard(false), 500);
        playSound('illegal');
        triggerHaptic('error');
    }
    return success;
  };

  const getMoveOptions = (square: Square) => {
    if (gameMode === 'online') {
        if (onlineRole !== displayedGame.turn()) return false;
        const piece = displayedGame.get(square);
        if (piece && piece.color !== onlineRole) return false;
    }

    const moves = displayedGame.moves({ square, verbose: true }) as Move[];
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }
    const newSquares: Record<string, React.CSSProperties> = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background: displayedGame.get(move.to as Square) && displayedGame.get(move.to as Square).color !== displayedGame.get(square).color
            ? 'radial-gradient(circle, rgba(0,0,0,.2) 25%, transparent 25%)'
            : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
        borderRadius: '50%',
      };
      return move;
    });
    newSquares[square] = { background: 'rgba(255, 255, 0, 0.4)' }; // Yellow Selection
    setOptionSquares(newSquares);
    return true;
  };

  const onSquareClick = (square: Square) => {
    if (gameMode === 'online' && onlineRole === 'spectator') return;

    let isMyTurn = true;
    if (gameMode === 'ai' && displayedGame.turn() !== playerColor) isMyTurn = false;
    if (gameMode === 'online' && onlineRole !== displayedGame.turn()) isMyTurn = false;

    if (!isMyTurn) {
        if (gameMode === 'pvp') return;

        const piece = displayedGame.get(square);
        const isOwnPiece = piece && (
            (gameMode === 'online' && piece.color === onlineRole) ||
            (gameMode === 'ai' && piece.color === playerColor)
        );

        if (isOwnPiece) {
             setMoveFrom(square);
             setOptionSquares({ [square]: { backgroundColor: 'rgba(220, 38, 38, 0.3)' } });
             setPremove(null);
             return;
        }

        if (moveFrom) {
            setPremove({ source: moveFrom as Square, target: square });
            setMoveFrom('');
            setOptionSquares({});
            return;
        }
        
        setPremove(null);
        setMoveFrom('');
        setOptionSquares({});
        return;
    }

    setPremove(null);
    setRightClickedSquares({});
    if (moveFrom) {
       if (moveFrom === square) { setMoveFrom(''); setOptionSquares({}); return; }
       
       // Check promotion click
       const piece = displayedGame.get(moveFrom as Square);
       const isPawn = piece?.type === 'p';
       const isPromotionMove = isPawn && (
            (piece.color === 'w' && square[1] === '8') ||
            (piece.color === 'b' && square[1] === '1')
       );

       if (isPromotionMove) {
           setPendingPromotion({ from: moveFrom as Square, to: square });
           setMoveFrom('');
           setOptionSquares({});
           return;
       }

       const success = safeGameMutate((g) => g.move({ from: moveFrom as Square, to: square, promotion: 'q' }));
       if (success) return;
       const hasMoves = getMoveOptions(square);
       if (hasMoves) setMoveFrom(square);
       else { setMoveFrom(''); setOptionSquares({}); }
    } else {
       const hasMoves = getMoveOptions(square);
       if (hasMoves) setMoveFrom(square);
    }
  };

  const resetGame = (overrideTime?: number) => {
    const newGame = new Chess();
    setGame(newGame);
    setCurrentMoveIndex(-1);
    setAnalysis(null);
    setMoveRatings({});
    setMoveFrom('');
    setOptionSquares({});
    setGameResult(null);
    setIsGameOver(false);
    setGameSaved(false);
    setPremove(null);
    setPendingPromotion(null);
    setGameReport(null);
    playSound('start');
    
    const t = overrideTime || timeControl;
    setWhiteTime(t);
    setBlackTime(t);
    lastTickRef.current = null; // Reset tick reference

    // Randomize Color again for AI
    if (gameMode === 'ai') {
        setPlayerColor(Math.random() > 0.5 ? 'w' : 'b');
    }
  };

  const handleTimeChange = (val: number) => {
    if (game.history().length > 0 && !isGameOver) {
        setPendingTimeControl(val);
        setIsTimeChangeModalOpen(true);
    } else {
        setTimeControl(val);
        resetGame(val);
    }
  };

  const confirmTimeChange = () => {
      if (pendingTimeControl) {
          setTimeControl(pendingTimeControl);
          resetGame(pendingTimeControl);
      }
      setIsTimeChangeModalOpen(false);
      setPendingTimeControl(null);
  };
  
  const cancelTimeChange = () => {
      setIsTimeChangeModalOpen(false);
      setPendingTimeControl(null);
  };

  const handleConfirmReset = () => {
      resetGame();
      setIsResetModalOpen(false);
  };
  
  const goToMove = (index: number) => { setCurrentMoveIndex(index); };
  
  const handleModeSwitch = (mode: string) => {
      if (gameMode === 'online') return;
      if (mode === gameMode) return;
      const targetMode = mode as 'ai' | 'pvp';
      if (game.history().length > 0 && !isGameOver) {
          setPendingMode(targetMode);
          setIsModeChangeModalOpen(true);
      } else {
          setGameMode(targetMode);
          // If switching to AI, randomize. If PvP, default to White.
          if (targetMode === 'ai') setPlayerColor(Math.random() > 0.5 ? 'w' : 'b');
          else setPlayerColor('w');
          playSound('start');
      }
  };

  const confirmModeChange = () => {
      if (pendingMode) { 
          setGameMode(pendingMode); 
          if (pendingMode === 'ai') setPlayerColor(Math.random() > 0.5 ? 'w' : 'b');
          else setPlayerColor('w');
          
          setGame(new Chess());
          setCurrentMoveIndex(-1);
          setWhiteTime(timeControl);
          setBlackTime(timeControl);
          setIsGameOver(false);
          setGameResult(null);
          playSound('start');
          lastTickRef.current = null;
      }
      setIsModeChangeModalOpen(false);
      setPendingMode(null);
    };

  const cancelModeChange = () => { setIsModeChangeModalOpen(false); setPendingMode(null); };

  const handleResign = async () => {
      if (!onlineGameId || onlineRole === 'spectator') return;
      if (confirm("Are you sure you want to resign?")) {
          // Calculate winner for record
          const winner = onlineRole === 'w' ? onlineNames.black : onlineNames.white;
          
          await resignGame(onlineGameId, onlineRole, onlineNames.white, onlineNames.black);
          
          // Save to History (Resigning player saves the game state)
          saveGame({
             fen: game.fen(),
             pgn: game.pgn(),
             winner: winner,
             reason: 'Resignation',
             mode: 'Online PvP',
             whitePlayer: onlineNames.white,
             blackPlayer: onlineNames.black
          });
          setGameSaved(true);
      }
  };

  const handleDrawOffer = async () => {
      if (!onlineGameId || onlineRole === 'spectator') return;
      if (confirm("Offer a draw to your opponent?")) {
          await offerDraw(onlineGameId, onlineRole);
      }
  };

  const handleAcceptDraw = async () => {
      if (!onlineGameId) return;
      await respondToDraw(onlineGameId, true, onlineNames.white, onlineNames.black);
      saveGame({
          fen: game.fen(),
          pgn: game.pgn(),
          winner: 'Draw',
          reason: 'Agreement',
          mode: 'Online PvP',
          whitePlayer: onlineNames.white,
          blackPlayer: onlineNames.black
      });
      setGameSaved(true);
  };

  // --- Full AI Report Flow ---
  const handleGenerateReportClick = () => {
      if (game.history().length === 0) return; 
      setIsGameOver(false); // Close Game Over modal
      setIsLanguageModalOpen(true); // Open Language Selection
  };

  const confirmAnalysis = async (language: string) => {
      setReportLanguage(language);
      setIsLanguageModalOpen(false);
      setIsGeneratingReport(true);
      setActiveTab('report');
      
      const pgn = game.pgn();
      const report = await generateGameReport(pgn, language);
      
      setGameReport(report);
      setIsGeneratingReport(false);
  };

  const getMoveRatingIcon = (rating?: string) => {
    switch(rating?.toLowerCase()) {
        case 'brilliant': return <Sparkles size={14} className="text-teal-400 dark:text-teal-300 animate-pulse" />;
        case 'great': return <Award size={14} className="text-blue-500 dark:text-blue-400" />;
        case 'best': return <Star size={14} className="text-green-500 dark:text-green-400" />;
        case 'excellent': return <ThumbsUp size={14} className="text-emerald-500 dark:text-emerald-400" />;
        case 'good': return <Check size={14} className="text-green-600 dark:text-green-300" />;
        case 'book': return <BookOpen size={14} className="text-amber-600 dark:text-amber-400" />;
        case 'inaccuracy': return <AlertCircle size={14} className="text-yellow-500 dark:text-yellow-400" />;
        case 'mistake': return <AlertTriangle size={14} className="text-orange-500 dark:text-orange-400" />;
        case 'miss': return <X size={14} className="text-red-500 dark:text-red-400" />;
        case 'blunder': return <ShieldAlert size={14} className="text-destructive font-bold" />;
        default: return null;
    }
  };

  // Helper for timers
  const Timer = ({ time, isActive, isBottom, label, rating, avatarUrl }: { time: number, isActive: boolean, isBottom: boolean, label?: string, rating?: string, avatarUrl?: string }) => (
      <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border transition-all duration-300 w-full justify-between relative
          ${isActive 
              ? 'bg-card border-primary ring-1 ring-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]' 
              : 'bg-muted/50 border-transparent opacity-80'
          }
      `}>
          <div className="flex items-center gap-3 z-10">
              {/* Avatar */}
              <div className="relative w-10 h-10 rounded-full bg-secondary border border-border overflow-hidden shrink-0 shadow-sm">
                  {avatarUrl ? (
                      <img src={avatarUrl} alt={label} className="w-full h-full object-cover" />
                  ) : (
                      <div className="flex items-center justify-center w-full h-full text-xs font-bold text-muted-foreground bg-muted">
                          {label?.[0]?.toUpperCase() || "?"}
                      </div>
                  )}
                  {/* Active Indicator Dot */}
                  {isActive && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-card animate-pulse"></div>}
              </div>

              <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground truncate max-w-[120px]">{label}</span>
              </div>
          </div>
          
          {/* Centered Rating Badge (Absolute) */}
          {rating && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 animate-in zoom-in fade-in duration-300 bg-background/95 backdrop-blur-md px-3 py-1 rounded-full border border-primary/20 shadow-md z-20">
                  {getMoveRatingIcon(rating)}
                  <span className={`text-[10px] font-black uppercase tracking-wider ${
                      rating === 'Brilliant' ? 'text-teal-400' :
                      rating === 'Great' ? 'text-blue-500' :
                      rating === 'Best' ? 'text-green-500' :
                      rating === 'Excellent' ? 'text-emerald-500' :
                      rating === 'Good' ? 'text-green-600' :
                      rating === 'Inaccuracy' ? 'text-yellow-500' :
                      rating === 'Mistake' ? 'text-orange-500' :
                      rating === 'Blunder' ? 'text-destructive' :
                      rating === 'Miss' ? 'text-red-500' :
                      'text-muted-foreground'
                  }`}>
                      {rating}
                  </span>
              </div>
          )}

          <div className={`font-mono font-bold text-xl z-10 ${time < 30 ? 'text-destructive animate-pulse' : 'text-foreground'}`}>
              {formatTime(time)}
          </div>
      </div>
  );

  // --- Logic for Player Display (Spectator Fix) ---
  let topPlayerName = 'Opponent';
  let bottomPlayerName = currentUser || "You";
  let topPlayerTime = 0;
  let bottomPlayerTime = 0;
  let topPlayerAvatar = undefined;
  let bottomPlayerAvatar = undefined;
  let isTopActive = false;
  let isBottomActive = false;

  if (gameMode === 'online') {
      if (onlineRole === 'spectator') {
          // Spectator View: White Bottom, Black Top
          topPlayerName = onlineNames.black;
          bottomPlayerName = onlineNames.white;
          topPlayerTime = blackTime;
          bottomPlayerTime = whiteTime;
          topPlayerAvatar = avatars.black;
          bottomPlayerAvatar = avatars.white;
          isTopActive = !isGameOver && displayedGame.turn() === 'b';
          isBottomActive = !isGameOver && displayedGame.turn() === 'w';
      } else {
          // Player View
          const iAmWhite = onlineRole === 'w';
          topPlayerName = iAmWhite ? onlineNames.black : onlineNames.white;
          bottomPlayerName = iAmWhite ? onlineNames.white : onlineNames.black;
          topPlayerTime = iAmWhite ? blackTime : whiteTime;
          bottomPlayerTime = iAmWhite ? whiteTime : blackTime;
          topPlayerAvatar = iAmWhite ? avatars.black : avatars.white;
          bottomPlayerAvatar = iAmWhite ? avatars.white : avatars.black;
          isTopActive = !isGameOver && displayedGame.turn() !== onlineRole;
          isBottomActive = !isGameOver && displayedGame.turn() === onlineRole;
      }
  } else if (gameMode === 'ai') {
      topPlayerName = `Stockfish (Lvl ${aiLevel})`;
      topPlayerTime = playerColor === 'w' ? blackTime : whiteTime;
      bottomPlayerTime = playerColor === 'w' ? whiteTime : blackTime;
      topPlayerAvatar = playerColor === 'w' ? avatars.black : avatars.white;
      bottomPlayerAvatar = playerColor === 'w' ? avatars.white : avatars.black;
      isTopActive = !isGameOver && displayedGame.turn() !== playerColor;
      isBottomActive = !isGameOver && displayedGame.turn() === playerColor;
  } else {
      // Local PvP
      topPlayerName = "Player 2";
      topPlayerTime = blackTime; // Assuming standard orientation
      bottomPlayerTime = whiteTime;
      topPlayerAvatar = avatars.black; // Standard
      bottomPlayerAvatar = avatars.white;
      isTopActive = !isGameOver && displayedGame.turn() === 'b';
      isBottomActive = !isGameOver && displayedGame.turn() === 'w';
  }

  const getLastRating = (forBottom: boolean) => {
    // Only implemented for simple bottom/top logic right now
    // Ideally we trace back moves.
    return undefined; 
  };

  const handleSpectate = (gameId: string) => {
      setIsLobbyOpen(false);
      if (onSpectate) onSpectate(gameId);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl mx-auto p-4">
      
      {/* Board Column */}
      <div className="w-full lg:w-2/3 flex flex-col items-center gap-2">
        {/* Top Timer */}
        <div className="w-full max-w-[600px]">
             <Timer 
                 time={topPlayerTime} 
                 isActive={isTopActive} 
                 isBottom={false} 
                 label={topPlayerName}
                 avatarUrl={topPlayerAvatar}
             />
        </div>

        <LiquidCard className="p-0 w-full max-w-[600px] aspect-square flex items-center justify-center relative rounded-sm border-2 overflow-hidden bg-background">
          {isCheck && !isGameOver && (
              <div className="absolute top-10 z-20 pointer-events-none">
                  <div className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md font-bold text-sm shadow-md border border-destructive-foreground/20 flex items-center gap-2">
                     <AlertTriangle size={16} /> Check
                  </div>
              </div>
          )}
          
          {/* Promotion Modal Overlay */}
          {pendingPromotion && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-sm animate-in fade-in duration-200">
                  <div className="flex flex-col items-center gap-4">
                      <div className="bg-card border border-border p-4 rounded-xl shadow-2xl flex gap-4 animate-in zoom-in-95 duration-200">
                          {['q', 'r', 'b', 'n'].map((p) => (
                              <button
                                  key={p}
                                  onClick={() => finalizePromotion(p as any)}
                                  className="w-16 h-16 flex items-center justify-center text-4xl bg-secondary hover:bg-primary hover:text-primary-foreground rounded-lg transition-all border border-border hover:scale-110 transform duration-150 shadow-md"
                              >
                                  {getPieceUnicode(p, displayedGame.turn())}
                              </button>
                          ))}
                      </div>
                      <LiquidButton variant="secondary" onClick={() => setPendingPromotion(null)} className="h-8 text-xs">
                          <X size={14} className="mr-1"/> Cancel Move
                      </LiquidButton>
                  </div>
              </div>
          )}
          
          {/* Draw Offer Overlay */}
          {incomingDrawOffer && onlineRole !== 'spectator' && incomingDrawOffer !== onlineRole && !isGameOver && (
              <div className="absolute bottom-20 z-20 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-5">
                   <div className="bg-background/90 backdrop-blur border border-border px-4 py-3 rounded-xl shadow-xl text-center">
                       <p className="text-sm font-bold mb-2">Opponent offered a draw</p>
                       <div className="flex gap-2">
                           <LiquidButton onClick={handleAcceptDraw} variant="primary" className="h-8 text-xs bg-green-600 hover:bg-green-700">Accept</LiquidButton>
                           <LiquidButton onClick={() => onlineGameId && respondToDraw(onlineGameId, false, onlineNames.white, onlineNames.black)} variant="secondary" className="h-8 text-xs">Decline</LiquidButton>
                       </div>
                   </div>
              </div>
          )}

          <div className={`w-full h-full rounded-sm overflow-hidden ${shakeBoard ? 'animate-shake' : ''}`}>
            <Chessboard 
              id="BasicBoard"
              {...({
                position: displayedGame.fen(),
                onPieceDrop: onDrop,
                onSquareClick: onSquareClick,
                onSquareRightClick: (sq: Square) => setRightClickedSquares({...rightClickedSquares, [sq]: { backgroundColor: 'rgba(255, 0, 0, 0.4)' }}),
                arePiecesDraggable: !isGameOver && (currentMoveIndex === -1), 
                customSquareStyles: { ...lastMoveSquares, ...optionSquares, ...rightClickedSquares, ...premoveSquares },
                // Minimal Board Styles
                customDarkSquareStyle: { backgroundColor: '#71717a' },
                customLightSquareStyle: { backgroundColor: '#e4e4e7' },
                animationDuration: 200,
                // If spectator, fixed to white. Else dynamic.
                boardOrientation: (gameMode === 'online' && onlineRole === 'spectator') 
                    ? 'white' 
                    : (playerColor === 'w' ? 'white' : 'black'),
              } as any)}
            />
          </div>
        </LiquidCard>

        {/* Bottom Timer */}
        <div className="w-full max-w-[600px]">
             <Timer 
                 time={bottomPlayerTime} 
                 isActive={isBottomActive} 
                 isBottom={true} 
                 label={bottomPlayerName}
                 avatarUrl={bottomPlayerAvatar}
             />
        </div>

        {/* Controls */}
        <div className="mt-2 flex flex-col md:flex-row w-full max-w-[600px] justify-center items-center gap-4">
            <div className="flex flex-wrap justify-center gap-2 items-center w-full">
                {gameMode !== 'online' && (
                    <>
                        <LiquidSwitch 
                            options={[
                                { value: 'ai', label: 'AI', icon: <Bot size={14}/> },
                                { value: 'pvp', label: 'PvP', icon: <Users size={14}/> }
                            ]}
                            activeValue={gameMode}
                            onChange={handleModeSwitch}
                        />
                        
                        {/* Time Control Selector */}
                        <div className="flex items-center bg-muted/50 rounded-md p-1 border border-border">
                            <Clock size={14} className="ml-2 mr-2 text-muted-foreground"/>
                            <div className="flex gap-1">
                                {TIME_CONTROLS.map((tc) => (
                                    <button
                                        key={tc.value}
                                        onClick={() => handleTimeChange(tc.value)}
                                        className={`
                                            px-2 py-1 rounded-sm text-[10px] font-bold transition-all
                                            ${(pendingTimeControl === tc.value || (!pendingTimeControl && timeControl === tc.value))
                                                ? 'bg-secondary text-secondary-foreground shadow-sm' 
                                                : 'text-muted-foreground hover:bg-background hover:text-foreground'
                                            }
                                        `}
                                        title={tc.category}
                                    >
                                        {tc.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                         {gameMode === 'ai' && (
                            <div className="flex items-center bg-muted/50 rounded-md p-1 border border-border">
                                <span className="text-[10px] font-bold px-2 text-muted-foreground uppercase mr-1">Lvl</span>
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5].map((lvl) => (
                                        <button
                                            key={lvl}
                                            onClick={() => setAiLevel(lvl)}
                                            className={`
                                                w-6 h-6 flex items-center justify-center rounded-sm text-[10px] font-bold transition-all
                                                ${aiLevel === lvl 
                                                    ? 'bg-primary text-primary-foreground shadow-sm scale-110' 
                                                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                                                }
                                            `}
                                        >
                                            {lvl}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
                
                {gameMode === 'pvp' && (
                    <LiquidButton onClick={() => setIsLobbyOpen(true)} variant="primary" className="px-4 py-2 text-xs flex items-center gap-2">
                        <Globe size={14} className="animate-pulse-slow"/> Find Match
                    </LiquidButton>
                )}

                {/* Online Controls: Resign / Draw */}
                {gameMode === 'online' && onlineRole !== 'spectator' && !isGameOver && (
                    <div className="flex gap-2 ml-auto">
                        <button onClick={handleResign} className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1 border border-destructive/20" title="Resign">
                            <Flag size={14}/> Resign
                        </button>
                        <button onClick={handleDrawOffer} disabled={!!incomingDrawOffer} className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1 border border-input disabled:opacity-50" title="Offer Draw">
                            <Handshake size={14}/> Draw
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Info Panel - Keeping minimal structure for brevity, logic remains same */}
      <div className="w-full lg:w-1/3 flex flex-col gap-4">
        <LiquidCard className="h-full flex flex-col p-5 min-h-[500px]">
             <div className="mb-4 z-10">
                 <div className="flex justify-between items-start mb-3 pt-2 px-1">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Cpu className="text-primary" size={24} />
                            {isAnalyzing && (
                                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col">
                            <h2 className="font-bold text-xl leading-none tracking-tight">Stockfish 18 NNUE</h2>
                            <span className="text-[10px] text-muted-foreground font-mono tracking-widest flex items-center gap-1 mt-1">
                               <Activity size={10} className="text-green-500"/> ENGINE ACTIVE {gameMode === 'ai' ? `• LVL ${aiLevel}` : ''}
                            </span>
                        </div>
                    </div>
                 </div>
                 {/* ... Tabs and Analysis/History View ... */}
                 <div className="flex space-x-1 bg-muted p-1 rounded-md">
                    <button 
                        onClick={() => setActiveTab('analysis')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'analysis' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <Brain size={14}/> Analysis
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'history' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <ClipboardList size={14}/> History
                    </button>
                    {gameMode === 'online' && (
                        <button 
                            onClick={() => setActiveTab('chat')}
                            className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <MessageSquare size={14}/> Chat
                        </button>
                    )}
                    <button 
                        onClick={() => setActiveTab('report')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'report' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <FileText size={14}/> Report
                    </button>
                 </div>
             </div>
             
             {/* Content Area */}
             <div className="flex-grow overflow-y-auto custom-scrollbar relative z-0 text-center text-muted-foreground text-sm pt-4">
                 
                 {/* ANALYSIS TAB */}
                 {activeTab === 'analysis' && (
                     !analysis ? <div className="animate-pulse pt-10">Waiting for move...</div> : (
                     <div className="text-left space-y-4">
                         {/* Classification - Moved to top */}
                         <div className="flex items-center gap-3 justify-center py-4 bg-muted/20 rounded-md border border-border">
                             {analysis.moveRating && getMoveRatingIcon(analysis.moveRating)}
                             <span className="font-bold text-2xl tracking-tight">{analysis.moveRating || "Analyzing..."}</span>
                         </div>

                         {/* EVAL BAR */}
                         <div className="relative h-8 w-full bg-zinc-800 rounded-md overflow-hidden border border-white/10 shadow-inner">
                             {/* White Bar */}
                             <div 
                                 className="absolute top-0 left-0 bottom-0 bg-white transition-all duration-700 ease-out shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                                 style={{ width: `${analysis.whiteWinningChance}%` }}
                             ></div>
                             
                             {/* Text Overlay */}
                             <div className="absolute inset-0 flex items-center justify-center z-10 mix-blend-exclusion pointer-events-none">
                                  <span className="font-mono font-black text-white tracking-widest text-sm">
                                      {formatEval(analysis.evaluation)}
                                  </span>
                             </div>
                             
                             {/* Markers */}
                             <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-black/20 z-0"></div>
                         </div>

                         <div className="grid grid-cols-2 gap-3">
                            <div className="bg-muted/30 p-3 rounded border text-center">
                                <span className="block text-xs font-bold text-muted-foreground uppercase">Best</span>
                                <span className="text-xl font-bold">{analysis.bestMove}</span>
                            </div>
                            <div className="bg-muted/30 p-3 rounded border text-center">
                                <span className="block text-xs font-bold text-muted-foreground uppercase">Depth</span>
                                <span className="text-xl font-bold">{analysis.depth}</span>
                            </div>
                         </div>
                         <div className="bg-muted/30 p-3 rounded border">
                             <p className="text-xs font-medium">{analysis.strategy}</p>
                         </div>
                     </div>
                 ))}

                 {/* HISTORY TAB */}
                 {activeTab === 'history' && (
                     <div className="text-left space-y-1 h-full">
                         {game.history().map((move, i) => (
                             <div 
                                 key={i} 
                                 onClick={() => goToMove(i)}
                                 className={`text-xs border-b border-border py-1 flex justify-between cursor-pointer hover:bg-muted/50 px-2 rounded-sm ${currentMoveIndex === i ? 'bg-primary/20 font-bold' : ''}`}
                             >
                                 <span className="font-mono text-muted-foreground">{(i % 2 === 0 ? Math.floor(i/2)+1 + '.' : '')}</span>
                                 <span className="font-bold">{move}</span>
                                 {moveRatings[i] && getMoveRatingIcon(moveRatings[i])}
                             </div>
                         ))}
                     </div>
                 )}
                 
                 {/* CHAT TAB */}
                 {activeTab === 'chat' && (
                     <div className="flex flex-col h-full">
                         <div className="flex-grow overflow-y-auto space-y-2 p-2 text-left" ref={chatScrollRef}>
                             {chatMessages.length === 0 ? (
                                 <p className="text-xs text-center pt-10 opacity-50">No messages yet. Say hi!</p>
                             ) : (
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {chatMessages.map((msg, i) => (
                                        <motion.div 
                                            layout
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ duration: 0.2, ease: "easeOut" }}
                                            key={`${msg.id}-${i}`} 
                                            className={`flex flex-col ${msg.sender === currentUser ? 'items-end' : 'items-start'}`}
                                        >
                                            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs break-words ${
                                                msg.sender === currentUser 
                                                    ? 'bg-primary text-primary-foreground rounded-br-none' 
                                                    : 'bg-muted text-foreground rounded-bl-none'
                                            }`}>
                                                {msg.text}
                                            </div>
                                            <span className="text-[9px] text-muted-foreground mt-0.5 px-1">{msg.sender === currentUser ? 'You' : msg.sender}</span>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                             )}
                         </div>
                         <div className="mt-2 flex gap-2 pt-2 border-t border-border">
                             <input 
                                type="text" 
                                value={chatInput} 
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Type a message..."
                                className="flex-grow bg-background border border-input rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                             />
                             <button onClick={handleSendMessage} className="bg-secondary p-1.5 rounded-md hover:bg-secondary/80 text-secondary-foreground">
                                 <Send size={16}/>
                             </button>
                         </div>
                     </div>
                 )}

                 {/* REPORT TAB (GEMINI 3 PRO) */}
                 {activeTab === 'report' && (
                     <div className={`text-left h-full flex flex-col ${RTL_LANGUAGES.includes(reportLanguage) ? 'font-vazir' : ''}`} dir={RTL_LANGUAGES.includes(reportLanguage) ? 'rtl' : 'ltr'}>
                         {isGeneratingReport ? (
                             <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
                                 <Bot size={48} className="animate-bounce text-primary" />
                                 <p className="text-sm font-bold animate-pulse">Gemini 3 Pro is analyzing...</p>
                             </div>
                         ) : !gameReport ? (
                             <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
                                 <FileText size={32} />
                                 <p className="text-xs">No report generated.</p>
                                 {game.history().length > 0 && (
                                     <LiquidButton onClick={() => setIsLanguageModalOpen(true)} variant="secondary" className="mt-2">Generate Now</LiquidButton>
                                 )}
                             </div>
                         ) : (
                             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                 {/* Summary Card */}
                                 <div className="bg-gradient-to-br from-primary/10 to-transparent p-4 rounded-xl border border-primary/20">
                                     <div className="flex items-center gap-2 mb-2">
                                         <Sparkles size={16} className="text-primary"/>
                                         <h3 className="font-bold text-sm">Game Summary</h3>
                                     </div>
                                     <p className="text-xs text-muted-foreground leading-relaxed">{gameReport.summary}</p>
                                     <div className="grid grid-cols-2 gap-2 mt-3">
                                         <div className="bg-background/50 p-2 rounded border text-center">
                                             <div className="text-[10px] uppercase font-bold text-muted-foreground">White Acc.</div>
                                             <div className="text-lg font-bold text-foreground">{gameReport.whiteAccuracy}%</div>
                                         </div>
                                         <div className="bg-background/50 p-2 rounded border text-center">
                                             <div className="text-[10px] uppercase font-bold text-muted-foreground">Black Acc.</div>
                                             <div className="text-lg font-bold text-foreground">{gameReport.blackAccuracy}%</div>
                                         </div>
                                     </div>
                                 </div>

                                 {/* Key Moments */}
                                 <div className="space-y-2">
                                     <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-2">
                                         <Activity size={12}/> Key Moments
                                     </h4>
                                     {gameReport.keyMoments.map((moment, idx) => (
                                         <div 
                                             key={idx} 
                                             onClick={() => goToMove(moment.moveNumber * 2 - (moment.color === 'White' ? 1 : 0) - 1)}
                                             className="bg-card border border-border p-3 rounded-lg hover:border-primary/50 transition-colors cursor-pointer group"
                                         >
                                             <div className="flex justify-between items-start mb-1">
                                                 <div className="flex items-center gap-2">
                                                     <span className="font-mono font-bold text-xs bg-muted px-1.5 py-0.5 rounded">
                                                         {moment.moveNumber}. {moment.color === 'Black' ? '...' : ''}{moment.moveSan}
                                                     </span>
                                                     {getMoveRatingIcon(moment.classification)}
                                                     <span className={`text-[10px] font-bold uppercase ${
                                                         moment.classification === 'Brilliant' ? 'text-teal-400' :
                                                         moment.classification === 'Blunder' ? 'text-destructive' :
                                                         'text-muted-foreground'
                                                     }`}>
                                                         {moment.classification}
                                                     </span>
                                                 </div>
                                                 <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity ltr:rotate-0 rtl:rotate-180"/>
                                             </div>
                                             <p className="text-xs text-muted-foreground">{moment.explanation}</p>
                                             {moment.improvement && (
                                                 <div className="mt-2 text-[10px] text-green-600 bg-green-500/10 px-2 py-1 rounded flex items-center gap-1">
                                                     <RotateCcw size={10}/> Better: {moment.improvement}
                                                 </div>
                                             )}
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         )}
                     </div>
                 )}
             </div>
        </LiquidCard>

        {/* --- MODALS --- */}

        {/* MATCH VS MODAL */}
        <LiquidModal isOpen={showMatchStart} onClose={() => setShowMatchStart(false)} title="Match Preview">
             <div className="flex flex-col gap-6">
                 {/* Player Headers */}
                 <div className="flex justify-between items-center px-2 relative">
                     <div className="flex flex-col items-center">
                         <div className="w-16 h-16 rounded-full bg-white text-black border-2 border-slate-200 flex items-center justify-center text-xl font-bold mb-2 shadow-lg relative overflow-hidden">
                             {avatars.white ? <img src={avatars.white} className="w-full h-full object-cover"/> : onlineNames.white?.[0]?.toUpperCase()}
                         </div>
                         <span className="font-bold text-sm">{onlineNames.white}</span>
                         <span className="text-[10px] text-muted-foreground uppercase tracking-widest">White</span>
                     </div>

                     <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
                         <Swords size={32} className="text-muted-foreground opacity-50 animate-pulse"/>
                     </div>

                     <div className="flex flex-col items-center">
                         <div className="w-16 h-16 rounded-full bg-black text-white border-2 border-slate-700 flex items-center justify-center text-xl font-bold mb-2 shadow-lg relative overflow-hidden">
                             {avatars.black ? <img src={avatars.black} className="w-full h-full object-cover"/> : onlineNames.black?.[0]?.toUpperCase()}
                         </div>
                         <span className="font-bold text-sm">{onlineNames.black}</span>
                         <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Black</span>
                     </div>
                 </div>

                 {/* AI Analysis */}
                 <div className="bg-muted/30 border border-border rounded-xl p-4">
                     {isPreviewLoading ? (
                         <div className="flex flex-col items-center justify-center py-6 gap-3 text-muted-foreground opacity-70">
                             <Bot size={24} className="animate-bounce text-primary"/>
                             <p className="text-xs">Analyzing player history...</p>
                         </div>
                     ) : !matchPreviewData ? (
                         <p className="text-xs text-center text-muted-foreground">Preview unavailable.</p>
                     ) : (
                         <div className="space-y-4 animate-in fade-in">
                             <div className="text-center">
                                 <h4 className="text-sm font-bold text-primary mb-1 flex items-center justify-center gap-1"><Sparkles size={12}/> Matchup Analysis</h4>
                                 <p className="text-xs text-muted-foreground leading-relaxed">{matchPreviewData.summary}</p>
                             </div>

                             <div className="grid grid-cols-2 gap-4 text-xs">
                                 <div className="space-y-1">
                                     <strong className="block text-foreground border-b border-border pb-1 mb-1">White Stats</strong>
                                     <p><span className="text-muted-foreground">Style:</span> {matchPreviewData.white.style}</p>
                                     <p className="text-green-600"><span className="text-muted-foreground">Pro:</span> {matchPreviewData.white.strengths?.[0]}</p>
                                     <p className="text-red-500"><span className="text-muted-foreground">Con:</span> {matchPreviewData.white.weaknesses?.[0]}</p>
                                 </div>
                                 <div className="space-y-1 text-right">
                                     <strong className="block text-foreground border-b border-border pb-1 mb-1">Black Stats</strong>
                                     <p>{matchPreviewData.black.style} <span className="text-muted-foreground">:Style</span></p>
                                     <p className="text-green-600">{matchPreviewData.black.strengths?.[0]} <span className="text-muted-foreground">:Pro</span></p>
                                     <p className="text-red-500">{matchPreviewData.black.weaknesses?.[0]} <span className="text-muted-foreground">:Con</span></p>
                                 </div>
                             </div>

                             <div className="bg-primary/5 p-2 rounded text-center border border-primary/10">
                                 <p className="text-[10px] font-bold uppercase text-primary mb-0.5">Prediction</p>
                                 <p className="text-xs italic">{matchPreviewData.prediction}</p>
                             </div>
                         </div>
                     )}
                 </div>

                 <LiquidButton onClick={() => setShowMatchStart(false)} variant="primary" className="w-full justify-center">
                     {onlineRole === 'spectator' ? 'Watch Game' : 'Start Match'}
                 </LiquidButton>
             </div>
        </LiquidModal>

        <LiquidModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} title="Start New Game?">
            <div className="flex flex-col gap-4">
                <p className="text-muted-foreground text-sm">Resetting will lose current progress.</p>
                <div className="flex gap-3 justify-end">
                    <LiquidButton onClick={() => setIsResetModalOpen(false)} variant="secondary">Cancel</LiquidButton>
                    <LiquidButton onClick={handleConfirmReset} variant="danger">Reset</LiquidButton>
                </div>
            </div>
        </LiquidModal>

        <LiquidModal isOpen={isModeChangeModalOpen} onClose={cancelModeChange} title="Switch Game Mode?">
            <div className="flex flex-col gap-4">
                <p className="text-muted-foreground text-sm">Switching modes will reset the current game.</p>
                <div className="flex gap-3 justify-end">
                    <LiquidButton onClick={cancelModeChange} variant="secondary">Cancel</LiquidButton>
                    <LiquidButton onClick={confirmModeChange} variant="danger">Confirm</LiquidButton>
                </div>
            </div>
        </LiquidModal>

        <LiquidModal isOpen={isTimeChangeModalOpen} onClose={cancelTimeChange} title="Change Time Control?">
            <div className="flex flex-col gap-4">
                <p className="text-muted-foreground text-sm">Changing time control will reset the current game. Are you sure?</p>
                <div className="flex gap-3 justify-end">
                    <LiquidButton onClick={cancelTimeChange} variant="secondary">Cancel</LiquidButton>
                    <LiquidButton onClick={confirmTimeChange} variant="danger">Reset & Change</LiquidButton>
                </div>
            </div>
        </LiquidModal>

        <LiquidModal isOpen={isGameOver} onClose={() => setIsGameOver(false)} title={gameResult?.winner === 'Draw' ? "Draw" : "Game Over"}>
            <div className="flex flex-col items-center gap-4 text-center py-2">
                {gameResult?.winner === 'Draw' ? (
                    <div className="p-4 bg-muted rounded-full">
                        <Dices size={40} className="text-muted-foreground"/>
                    </div>
                ) : (
                    <div className="p-4 bg-primary/10 rounded-full">
                        <Trophy size={40} className="text-primary animate-bounce"/>
                    </div>
                )}
                
                <div>
                    <h2 className="text-3xl font-bold tracking-tight mb-1">
                        {gameResult?.winner === 'Draw' ? 'Draw' : `${gameResult?.winner} Wins`}
                    </h2>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">{gameResult?.reason}</p>
                </div>

                {gameSaved && (
                    <div className="flex items-center gap-2 text-xs font-mono text-green-600 bg-green-500/10 px-3 py-1 rounded-full">
                        <Database size={12}/> <span>Match Recorded</span>
                    </div>
                )}

                <div className="flex flex-col gap-3 w-full mt-4">
                    <LiquidButton onClick={handleGenerateReportClick} className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-none shadow-lg">
                        <Sparkles size={16} className="mr-2"/> Full AI Analysis (Gemini Pro)
                    </LiquidButton>
                    <div className="flex gap-3 w-full">
                        <LiquidButton variant="secondary" onClick={() => setIsGameOver(false)} className="flex-1">
                            Review Board
                        </LiquidButton>
                        <LiquidButton variant="primary" onClick={() => resetGame()} className="flex-1">
                            New Game
                        </LiquidButton>
                    </div>
                </div>
            </div>
        </LiquidModal>
        
        <LiquidModal isOpen={isLanguageModalOpen} onClose={() => setIsLanguageModalOpen(false)} title="Select Report Language">
             <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                 <p className="text-xs text-muted-foreground text-center mb-2">
                     Gemini will generate the analysis report in your selected language.
                 </p>
                 <div className="grid grid-cols-2 gap-2">
                     {REPORT_LANGUAGES.map(lang => (
                         <button
                             key={lang}
                             onClick={() => confirmAnalysis(lang)}
                             className="px-4 py-3 bg-muted/50 hover:bg-primary/10 hover:border-primary/50 border border-border rounded-lg text-sm font-medium transition-all text-left flex items-center gap-2"
                         >
                             <Globe size={14} className="text-muted-foreground"/>
                             {lang}
                         </button>
                     ))}
                 </div>
                 <LiquidButton variant="secondary" onClick={() => setIsLanguageModalOpen(false)} className="mt-2">
                     Cancel
                 </LiquidButton>
             </div>
        </LiquidModal>
        
        <LiquidModal isOpen={isUsernameModalOpen} onClose={() => {}} title="Welcome">
             <div className="flex flex-col gap-4">
                <p className="text-muted-foreground text-sm text-center mb-2">Enter Username</p>
                <input type="text" placeholder="Username" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className="w-full p-2 border rounded" />
                <LiquidButton onClick={handleUsernameSubmit} variant="primary" className="w-full" disabled={!usernameInput.trim()}>Start</LiquidButton>
             </div>
        </LiquidModal>

        <LiquidModal isOpen={isLobbyOpen} onClose={() => setIsLobbyOpen(false)} title="Online Lobby">
             <div className="flex flex-col h-[500px]">
                <div className="flex-grow overflow-hidden border rounded-md">
                    <OnlinePlayers 
                        currentUser={currentUser} 
                        onChallengeSent={() => alert("Challenge Sent!")} 
                        onSpectate={handleSpectate}
                    />
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                     <LiquidButton onClick={() => setIsLobbyOpen(false)} variant="secondary" className="w-full">Close</LiquidButton>
                </div>
             </div>
        </LiquidModal>
      </div>
    </div>
  );
};
