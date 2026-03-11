import React from 'react';

export interface ChessAnalysis {
  strategy: string;
  threats: string;
  evaluation: number; // Positive for white advantage, negative for black
  bestMove: string;
  whiteWinningChance: number;
  drawChance: number;
  blackWinningChance: number;
  moveRating?: string; // e.g., "Brilliant", "Blunder", "Best"
  estimatedElo?: number; // e.g., 2450
  depth: number;
  continuation: string;
  grandmasterStyle?: string;
  gameAccuracy?: string;
}

export interface MoveAnalysis {
  moveNumber: number;
  color: 'White' | 'Black';
  moveSan: string;
  classification: 'Brilliant' | 'Great' | 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' | 'Book';
  explanation: string;
  improvement?: string;
}

export interface GameReport {
  summary: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  keyMoments: MoveAnalysis[];
}

export interface MatchPreview {
    white: {
        style: string;
        strengths: string[];
        weaknesses: string[];
    };
    black: {
        style: string;
        strengths: string[];
        weaknesses: string[];
    };
    summary: string;
    prediction: string;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  balance: number; // In TON/USD Credits
}

export interface LeaderboardEntry {
  id: string;
  rank: number;
  username: string;
  rating: number;
  winRate: number;
  avatar: string;
  title?: string;
  isOnline?: boolean;
}

export enum AppTab {
  PLAY = 'PLAY',
  TRAINING = 'TRAINING',
  WALLET = 'WALLET',
  LEADERBOARD = 'LEADERBOARD',
}

export type Theme = 'dark' | 'light';

export type AIEngine = 'gemini' | 'stockfish';

export interface Challenge {
  id: string;
  from: string;
  to?: string; // Optional for link-based invites
  status: 'pending' | 'accepted' | 'rejected';
  type?: 'direct' | 'invite_link'; // Removed 'wager'
  createdAt: any;
}

export interface Tournament {
    id: string;
    name: string;
    host: string; // Username of creator
    timeControl: number;
    status: 'open' | 'active' | 'completed';
    participants: Record<string, { username: string; avatar?: string; rating?: number }>;
    createdAt: any;
    winner?: string;
}

export interface ChatMessage {
    id?: string;
    sender: string;
    text: string;
    timestamp: number;
}

export interface LobbyMessage {
    id: string;
    sender: string;
    text: string;
    timestamp: number;
    avatar?: string;
}

export interface OnlineGame {
  id: string;
  whitePlayer: string;
  blackPlayer: string;
  fen: string;
  pgn: string;
  lastMove: string;
  winner?: string | null;
  status: 'active' | 'completed';
  whiteTime?: number;
  blackTime?: number;
  timeControl: number; // Initial time in seconds
  lastMoveTimestamp?: number; // Server timestamp of last move
  drawOffer?: 'w' | 'b' | null;
  reason?: string;
  tournamentId?: string; // Link to tournament if applicable
}

export interface UserData {
    id?: string; // Explicit DB ID
    username: string;
    telegramId?: number;
    firstName?: string;
    lastName?: string;
    isPremium?: boolean;
    isBot?: boolean;
    addedToAttachmentMenu?: boolean;
    allowsWriteToPm?: boolean;
    walletAddress?: string | null;
    photoUrl?: string;
    platform?: string;
    referredBy?: string; // Username of referrer
    referralEarnings?: number;
    rating?: number;
    gamesPlayed?: number;
    wins?: number;
    lastActive?: any;
    languageCode?: string;
    isOnline?: boolean;
    balance?: number;
    isBanned?: boolean;
}