
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { 
  getDatabase, ref, set, get, onValue, push, update, 
  query, orderByChild, equalTo, limitToLast, limitToFirst, runTransaction, 
  serverTimestamp, child, remove, DataSnapshot, onDisconnect 
} from "firebase/database";
import { UserData, Tournament } from "../types";
import { BACKEND_URL } from "../config";

const firebaseConfig = {
  apiKey: "AIzaSyCHYdWez4_YG2dOn312NTKTctptGOCI-QU",
  authDomain: "etherchess-ai.firebaseapp.com",
  databaseURL: "https://etherchess-ai-default-rtdb.firebaseio.com/",
  projectId: "etherchess-ai",
  storageBucket: "etherchess-ai.firebasestorage.app",
  messagingSenderId: "557228043828",
  appId: "1:557228043828:web:a7c649177c317a98b72461",
  measurementId: "G-1JYKTT6FJC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const db = getDatabase(app);

// --- HELPER FUNCTIONS ---

const snapshotToArray = (snapshot: DataSnapshot, reverse = true) => {
    const arr: any[] = [];
    snapshot.forEach(child => {
        arr.push({ id: child.key, ...child.val() });
    });
    return reverse ? arr.reverse() : arr;
};

// --- PERFORMANCE CACHE LAYER ---
const CACHE_TTL = 300 * 1000;
const CACHE_PREFIX = 'etherchess_cache_';
interface CacheEntry { data: any; timestamp: number; }
const memoryCache = new Map<string, CacheEntry>();

export const getFromCache = (key: string, ignoreTTL = false) => {
    let entry = memoryCache.get(key);
    if (!entry) {
        try {
            const stored = localStorage.getItem(CACHE_PREFIX + key);
            if (stored) {
                entry = JSON.parse(stored);
                if (entry) memoryCache.set(key, entry);
            }
        } catch (e) {}
    }
    if (entry) {
        if (ignoreTTL || Date.now() - entry.timestamp <= CACHE_TTL) return entry.data;
        else {
            memoryCache.delete(key);
            localStorage.removeItem(CACHE_PREFIX + key);
        }
    }
    return null;
};

const setCache = (key: string, data: any) => {
    const entry = { data, timestamp: Date.now() };
    memoryCache.set(key, entry);
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry)); } catch (e) {}
};

const invalidateCache = (keyPrefix: string) => {
    for (const key of memoryCache.keys()) if (key.startsWith(keyPrefix)) memoryCache.delete(key);
    try {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(CACHE_PREFIX + keyPrefix)) localStorage.removeItem(key);
        });
    } catch(e) {}
};

// --- PRESENCE SYSTEM ---

export const setupPresence = (userId: string) => {
    const connectedRef = ref(db, ".info/connected");
    const userStatusRef = ref(db, "users/" + userId + "/isOnline");
    const lastActiveRef = ref(db, "users/" + userId + "/lastActive");

    const unsubscribe = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            onDisconnect(userStatusRef).set(false);
            onDisconnect(lastActiveRef).set(serverTimestamp());
            set(userStatusRef, true);
            set(lastActiveRef, serverTimestamp());
        }
    });
    return unsubscribe;
};

// --- NOTIFICATION HELPERS ---

export const sendTelegramNotification = async (userId: string, message: string) => {
    // 1. Get User Data to find Telegram ID
    const user = await getUser(userId);
    if (user && user.telegramId) {
        try {
            // 2. Call Backend API
            await fetch(`${BACKEND_URL}/api/challenge-notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: user.telegramId, text: message })
            });
        } catch (e) {
            console.error("Failed to notify user", e);
        }
    }
};

// --- USER MANAGEMENT ---

export const saveUser = async (userData: UserData) => {
  const key = userData.telegramId ? String(userData.telegramId) : userData.username;
  if (!key) return;
  
  const userRef = ref(db, 'users/' + key);
  
  invalidateCache(`user_${key}`);
  invalidateCache('leaderboard'); 

  // Sanitize data: remove undefined fields to prevent Firebase update errors
  const cleanData = Object.fromEntries(
    Object.entries(userData).filter(([_, v]) => v !== undefined)
  );

  try {
    const snap = await get(userRef);
    
    // Check for NEW referral
    if (!snap.exists() && userData.referredBy) {
        // Notify the referrer
        sendTelegramNotification(
            userData.referredBy, 
            `🎉 *New Referral!*\n\nPlayer *${userData.username}* just joined using your link. You'll earn commissions on their games.`
        );
    }

    if (!snap.exists()) {
        await set(userRef, {
            ...cleanData,
            rating: 1200,
            gamesPlayed: 0,
            wins: 0,
            balance: 100, 
            referralEarnings: 0,
            lastActive: serverTimestamp(),
            platform: "ETHERCHESS AI"
        });
    } else {
        const updates: any = { ...cleanData, lastActive: serverTimestamp() };
        if (snap.val().referredBy) {
            delete updates.referredBy; 
        }
        await update(userRef, updates);
    }
  } catch (error) {
    console.error("Error saving user:", error);
  }
};

export const updateUserPresence = async (userId: string) => {
    if (!userId) return;
    try { await update(ref(db, 'users/' + userId), { lastActive: serverTimestamp() }); } catch (e) { }
};

export const getUser = async (userId: string, forceRefresh = false) => {
  if (!userId) return null;
  const cacheKey = `user_${userId}`;
  if (!forceRefresh) {
      const cached = getFromCache(cacheKey);
      if (cached) return cached;
  }
  
  try {
    const dbRef = ref(db);
    // 1. Try direct lookup (assuming userId is key/telegramId)
    let snap = await get(child(dbRef, 'users/' + userId));
    
    // 2. If not found, try query by username (for legacy lookups or username-based logic)
    if (!snap.exists()) {
        const q = query(ref(db, 'users'), orderByChild('username'), equalTo(userId));
        const querySnap = await get(q);
        if (querySnap.exists()) {
            querySnap.forEach(child => {
                snap = child;
            });
        }
    }

    const data = snap.exists() ? { id: snap.key, ...snap.val() } : null;
    if (data) setCache(cacheKey, data);
    return data;
  } catch (error) { return null; }
};

export const notifyUser = async (targetUserId: string, message: string) => {
    // Alias to generic function
    await sendTelegramNotification(targetUserId, message);
};

export const getUserGames = async (userId: string, forceRefresh = false) => {
  if (!userId) return [];
  const cacheKey = `games_${userId}`;
  if (!forceRefresh) {
      const cached = getFromCache(cacheKey);
      if (cached) return cached;
  }
  
  try {
      const gamesRef = ref(db, 'games');
      const [s1, s2] = await Promise.all([
          get(query(gamesRef, orderByChild("whitePlayer"), equalTo(userId), limitToLast(20))),
          get(query(gamesRef, orderByChild("blackPlayer"), equalTo(userId), limitToLast(20)))
      ]);
      
      const games1 = snapshotToArray(s1, false);
      const games2 = snapshotToArray(s2, false);
      
      const allGames = [...games1, ...games2];
      const uniqueGames = Array.from(new Map(allGames.map((item:any) => [item.id, item])).values())
        .sort((a:any, b:any) => (b.createdAt || 0) - (a.createdAt || 0));

      setCache(cacheKey, uniqueGames);
      return uniqueGames;
  } catch (e) { return []; }
};

export const getLeaderboard = async (forceRefresh = false) => {
    const cacheKey = 'leaderboard';
    if (!forceRefresh) {
        const cached = getFromCache(cacheKey);
        if (cached) return cached;
    }
    try {
        const q = query(ref(db, "users"), orderByChild("rating"), limitToLast(50));
        const snapshot = await get(q);
        const users = snapshotToArray(snapshot, true);
        
        const result = users
            .filter(data => data.username)
            .map((data, index) => {
                return {
                    id: data.id,
                    rank: index + 1,
                    username: data.username,
                    rating: data.rating || 1200,
                    winRate: data.gamesPlayed > 0 ? Math.round((data.wins / data.gamesPlayed) * 100) : 0,
                    avatar: data.photoUrl || "",
                    title: data.rating >= 2400 ? "IM" : data.rating >= 2000 ? "Expert" : "Player"
                };
            });
        setCache(cacheKey, result);
        return result;
    } catch (e) { return []; }
};

// --- GAME LOGIC ---

export const saveGame = async (gameData: {
  fen: string;
  pgn: string;
  winner: string;
  reason: string;
  mode: string;
  whitePlayer: string;
  blackPlayer: string;
}) => {
  try {
    const gamesRef = ref(db, 'games');
    const newGameRef = push(gamesRef);
    await set(newGameRef, { ...gameData, createdAt: serverTimestamp() });
    
    invalidateCache(`games_${gameData.whitePlayer}`);
    invalidateCache(`games_${gameData.blackPlayer}`);
    
    // --- TELEGRAM NOTIFICATIONS FOR RESULTS ---
    if (gameData.mode === 'Online PvP' || gameData.mode === 'online') {
        const white = gameData.whitePlayer;
        const black = gameData.blackPlayer;
        
        if (gameData.winner === 'Draw') {
            sendTelegramNotification(white, `🤝 Match vs ${black} ended in a Draw.`);
            sendTelegramNotification(black, `🤝 Match vs ${white} ended in a Draw.`);
        } else if (gameData.winner === 'White') {
            sendTelegramNotification(white, `🏆 *Victory!* You defeated ${black}. (+10 Rating)`);
            sendTelegramNotification(black, `💀 *Defeat.* You lost to ${white}. (-5 Rating)`);
        } else if (gameData.winner === 'Black') {
            sendTelegramNotification(black, `🏆 *Victory!* You defeated ${white}. (+10 Rating)`);
            sendTelegramNotification(white, `💀 *Defeat.* You lost to ${black}. (-5 Rating)`);
        }
    }

    if (gameData.mode !== 'ai' && gameData.mode !== 'analysis') {
         const updateStats = async (player: string, isWinner: boolean) => {
             if (!player) return;
             // Must update by finding user first if key is not username
             const userData = await getUser(player);
             const key = userData ? userData.id : player;
             
             await runTransaction(ref(db, `users/${key}`), (user) => {
                 if (user) {
                     user.gamesPlayed = (user.gamesPlayed || 0) + 1;
                     if (isWinner) user.wins = (user.wins || 0) + 1;
                     user.rating = (user.rating || 1200) + (isWinner ? 10 : -5);
                 }
                 return user;
             });
        };
        await updateStats(gameData.whitePlayer, gameData.winner === 'White');
        await updateStats(gameData.blackPlayer, gameData.winner === 'Black');
    }
  } catch (error) { console.error("Error saving game:", error); }
};

// --- CHAT SYSTEM ---

export const sendChatMessage = async (gameId: string, sender: string, text: string) => {
    const chatRef = ref(db, `active_games/${gameId}/chat`);
    await push(chatRef, { sender, text, timestamp: serverTimestamp() });
};

export const getGameChatHistory = async (gameId: string) => {
    const chatRef = query(ref(db, `active_games/${gameId}/chat`), limitToLast(50));
    try {
        const snapshot = await get(chatRef);
        const messages: any[] = [];
        snapshot.forEach(child => {
            messages.push({ id: child.key, ...child.val() });
        });
        return messages;
    } catch(e) { return []; }
};

export const subscribeToChat = (gameId: string, callback: (messages: any[]) => void) => {
    const chatRef = ref(db, `active_games/${gameId}/chat`);
    return onValue(chatRef, (snapshot) => {
        const messages: any[] = [];
        snapshot.forEach(child => {
            messages.push({ id: child.key, ...child.val() });
        });
        callback(messages);
    });
};

export const sendLobbyMessage = async (sender: string, text: string, avatar: string = '') => {
    const chatRef = ref(db, 'lobby_chat');
    await push(chatRef, { sender, text, avatar, timestamp: serverTimestamp() });
};

export const getLobbyChatHistory = async () => {
    const chatRef = query(ref(db, 'lobby_chat'), limitToLast(50));
    try {
        const snapshot = await get(chatRef);
        const messages: any[] = [];
        snapshot.forEach(child => {
            messages.push({ id: child.key, ...child.val() });
        });
        return messages;
    } catch (e) { return []; }
};

export const subscribeToLobbyChat = (callback: (messages: any[]) => void) => {
    const chatRef = query(ref(db, 'lobby_chat'), limitToLast(50));
    return onValue(chatRef, (snapshot) => {
        const messages: any[] = [];
        snapshot.forEach(child => {
            messages.push({ id: child.key, ...child.val() });
        });
        callback(messages);
    });
};

// --- TOURNAMENT SYSTEM ---

export const createTournament = async (name: string, timeControl: number, host: string) => {
    const tRef = push(ref(db, 'tournaments'));
    await set(tRef, {
        name,
        timeControl,
        host,
        status: 'open',
        createdAt: serverTimestamp(),
        participants: {}
    });
    return tRef.key;
};

export const joinTournament = async (tournamentId: string, userId: string, username: string, avatar: string = '', rating: number = 1200) => {
    await update(ref(db, `tournaments/${tournamentId}/participants/${userId}`), {
        username,
        avatar,
        rating,
        joinedAt: serverTimestamp()
    });
    
    // Notify User
    await get(ref(db, `tournaments/${tournamentId}`)).then((snap) => {
        if(snap.exists()) {
            sendTelegramNotification(username, `✅ *Tournament Joined!*\n\nYou have successfully entered the tournament: *${snap.val().name}*.\nWait for the host to start.`);
        }
    });
};

export const leaveTournament = async (tournamentId: string, userId: string) => {
    await remove(ref(db, `tournaments/${tournamentId}/participants/${userId}`));
};

export const subscribeToTournaments = (callback: (tournaments: Tournament[]) => void) => {
    const q = query(ref(db, 'tournaments'), orderByChild('status'), limitToLast(20));
    return onValue(q, (snapshot) => {
        const ts: Tournament[] = [];
        snapshot.forEach(child => {
            ts.push({ id: child.key, ...child.val() });
        });
        callback(ts.reverse());
    });
};

// --- CHALLENGE & MATCHMAKING ---

export const subscribeToPlayers = (currentUserId: string, callback: (users: any[]) => void) => {
    const q = query(ref(db, "users"), orderByChild("lastActive"), limitToLast(200));
    return onValue(q, (snapshot) => {
        const users = snapshotToArray(snapshot, true)
            .map(data => {
                const now = Date.now();
                const lastActiveTime = data.lastActive ? new Date(data.lastActive).getTime() : 0;
                const isRecentlyActive = (now - lastActiveTime) < (3 * 60 * 1000);
                
                return { 
                    ...data, 
                    isOnline: data.isOnline === true || isRecentlyActive,
                    avatar: data.photoUrl || ""
                };
            })
            .filter(u => u.id !== currentUserId);
        callback(users);
    });
};

export const sendChallenge = async (fromId: string, toId: string) => {
    await push(ref(db, 'challenges'), { from: fromId, to: toId, status: 'pending', type: 'direct', createdAt: serverTimestamp() });
};

export const createInviteLink = async (fromId: string) => {
    const newRef = push(ref(db, 'challenges'));
    await set(newRef, { from: fromId, status: 'pending', type: 'invite_link', createdAt: serverTimestamp() });
    return newRef.key;
};

export const getChallenge = async (id: string) => {
    try { 
        const snap = await get(ref(db, `challenges/${id}`)); 
        return snap.exists() ? {id:snap.key, ...snap.val()} : null; 
    } catch(e){return null;}
};

export const respondToChallenge = async (challengeId: string, response: 'accepted' | 'rejected', challengeData?: any) => {
    await update(ref(db, `challenges/${challengeId}`), { status: response });
    
    if (response === 'accepted' && challengeData) {
        // NOTIFY CHALLENGER VIA TELEGRAM
        if (challengeData.from) {
             sendTelegramNotification(
                 challengeData.from, 
                 `⚔️ *Challenge Accepted!*\n\nYour match against ${challengeData.to || 'your opponent'} is starting now.`
             );
        }

        const gameRef = push(ref(db, 'active_games'));
        await set(gameRef, {
            whitePlayer: challengeData.from,
            blackPlayer: challengeData.to || "Player 2",
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            pgn: "",
            lastMove: "",
            status: "active",
            createdAt: serverTimestamp(),
            whiteTime: 600, 
            blackTime: 600,
            timeControl: 600,
            lastMoveTimestamp: serverTimestamp()
        });
        return gameRef.key;
    }
    return null;
};

export const acceptInvite = async (challengeId: string, fromId: string, acceptorId: string) => {
     const updates: any = {};
     updates[`challenges/${challengeId}/status`] = 'accepted';
     updates[`challenges/${challengeId}/to`] = acceptorId;
     
     // NOTIFY INVITE CREATOR
     if (fromId) {
        sendTelegramNotification(
             fromId, 
             `✅ *Invite Accepted!*\n\n${acceptorId} has accepted your game invite. The match is starting.`
        );
     }

     const gameId = push(ref(db, 'active_games')).key;
     updates[`active_games/${gameId}`] = {
            whitePlayer: fromId,
            blackPlayer: acceptorId,
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            pgn: "",
            lastMove: "",
            status: "active",
            createdAt: serverTimestamp(),
            whiteTime: 600, 
            blackTime: 600,
            timeControl: 600,
            lastMoveTimestamp: serverTimestamp()
     };
     
     await update(ref(db), updates);
     return gameId;
}

export const subscribeToChallenges = (userId: string, callback: (challenges: any[]) => void) => {
    const q = query(ref(db, 'challenges'), orderByChild('to'), equalTo(userId), limitToLast(20));
    return onValue(q, (snapshot) => {
        const challenges = snapshotToArray(snapshot).filter(c => c.status === 'pending');
        callback(challenges);
    });
};

export const subscribeToActiveUserGame = (userId: string, callback: (gameId: string | null) => void) => {
    const gamesRef = ref(db, 'active_games');
    const q1 = query(gamesRef, orderByChild('whitePlayer'), equalTo(userId));
    const q2 = query(gamesRef, orderByChild('blackPlayer'), equalTo(userId));
    
    const handleSnap = (snap: DataSnapshot) => {
        let activeId = null;
        snap.forEach(child => {
            if (child.val().status === 'active') activeId = child.key;
        });
        if (activeId) callback(activeId);
    };

    const u1 = onValue(q1, handleSnap);
    const u2 = onValue(q2, handleSnap);
    
    return () => { u1(); u2(); };
};

export const subscribeToGame = (gameId: string, callback: (gameData: any) => void) => {
    return onValue(ref(db, `active_games/${gameId}`), (snapshot) => {
        if (snapshot.exists()) {
            callback({ id: snapshot.key, ...snapshot.val() });
        }
    });
};

export const makeOnlineMove = async (gameId: string, fen: string, pgn: string, lastMove: string, isGameOver: boolean, winner: string | null, whiteTime: number, blackTime: number) => {
    const updates: any = {
        fen, pgn, lastMove,
        lastMoveTimestamp: serverTimestamp(),
        whiteTime, blackTime
    };
    if (isGameOver) {
        updates.status = 'completed';
        updates.winner = winner;
    }
    await update(ref(db, `active_games/${gameId}`), updates);
};

export const resignGame = async (gameId: string, role: 'w' | 'b' | 'spectator', whiteName: string, blackName: string) => {
    if (role === 'spectator') return;
    const winner = role === 'w' ? blackName : whiteName;
    await update(ref(db, `active_games/${gameId}`), {
        status: 'completed',
        winner: winner,
        reason: 'Resignation'
    });
};

export const offerDraw = async (gameId: string, role: 'w' | 'b') => {
    await update(ref(db, `active_games/${gameId}`), { drawOffer: role });
};

export const respondToDraw = async (gameId: string, accept: boolean, whiteName: string, blackName: string) => {
    if (accept) {
        await update(ref(db, `active_games/${gameId}`), {
            status: 'completed',
            winner: 'Draw',
            reason: 'Agreement',
            drawOffer: null
        });
    } else {
        await update(ref(db, `active_games/${gameId}`), { drawOffer: null });
    }
};

export const subscribeToActiveGamesList = (callback: (games: any[]) => void) => {
    const q = query(ref(db, 'active_games'), orderByChild('status'), equalTo('active'), limitToLast(20));
    return onValue(q, (snapshot) => {
        const games = snapshotToArray(snapshot, true);
        callback(games);
    });
};

export const joinMatchmakingQueue = async (userId: string, rating: number, timeControl: number) => {
    await set(ref(db, `matchmaking/${userId}`), {
        userId, rating, timeControl, timestamp: serverTimestamp()
    });
};

export const leaveMatchmakingQueue = async (userId: string) => {
    await remove(ref(db, `matchmaking/${userId}`));
};

export const findOpponentAndCreateGame = async (userId: string, rating: number, timeControl: number) => {
    try {
        const snap = await get(ref(db, 'matchmaking'));
        let opponentId = null;
        snap.forEach(child => {
            const val = child.val();
            if (val.userId !== userId && Math.abs(val.timeControl - timeControl) < 60) {
                opponentId = val.userId;
                return true; 
            }
        });

        if (opponentId) {
            const gameRef = push(ref(db, 'active_games'));
            await set(gameRef, {
                whitePlayer: userId,
                blackPlayer: opponentId,
                fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                status: 'active',
                timeControl: timeControl,
                whiteTime: timeControl,
                blackTime: timeControl,
                createdAt: serverTimestamp(),
                lastMoveTimestamp: serverTimestamp()
            });
            
            await remove(ref(db, `matchmaking/${userId}`));
            await remove(ref(db, `matchmaking/${opponentId}`));
            return true;
        }
        return false;
    } catch (e) { return false; }
};

// --- ADMIN FUNCTIONS ---

export const getAllUsers = async (limit = 50) => {
    try {
        const q = query(ref(db, 'users'), limitToLast(limit));
        const snapshot = await get(q);
        return snapshotToArray(snapshot, true);
    } catch (e) { return []; }
};

export const updateUserBalance = async (userId: string, amount: number) => {
    await update(ref(db, `users/${userId}`), { balance: amount });
};

export const banUser = async (userId: string, isBanned: boolean) => {
    await update(ref(db, `users/${userId}`), { isBanned });
};

export const deleteGame = async (gameId: string) => {
    await remove(ref(db, `active_games/${gameId}`));
};

export const getAllActiveGames = async () => {
    try {
        const snapshot = await get(ref(db, 'active_games'));
        return snapshotToArray(snapshot, true);
    } catch (e) { return []; }
};

export const deleteTournament = async (tournamentId: string) => {
    await remove(ref(db, `tournaments/${tournamentId}`));
};

