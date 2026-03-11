
import React, { useState, useEffect, useMemo } from 'react';
import { LiquidCard, LiquidButton, LiquidSwitch, LiquidModal, LiquidBadge } from './LiquidUI';
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownLeft, Trophy, User, Swords, Link as LinkIcon, History, Calendar, CheckCircle2, RefreshCw, Eye, Globe, Crown, Medal, Hexagon, Gift, Share2, Copy, Filter, Search, PlayCircle, XCircle, Handshake, ChevronRight } from 'lucide-react';
import { LeaderboardEntry, WalletState } from '../types';
import { getUserGames, getUser, getLeaderboard, getFromCache } from '../services/firebase';
import { OnlinePlayers } from './OnlinePlayers';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { BOT_USERNAME } from '../config';
import { useNotification } from './NotificationSystem';

interface WalletLeaderboardProps {
  wallet: WalletState;
  onConnectRequest: () => void;
  isActive: boolean;
  onReviewGame?: (pgn: string) => void;
  onSpectateGame?: (gameId: string) => void;
}

const MatchHistoryItem = ({ match, currentUser, onReview }: { match: any, currentUser: string | null, onReview?: (pgn: string) => void }) => {
    const [opponent, setOpponent] = useState<any>(null);
    
    const isWhite = match.whitePlayer === currentUser;
    // Handle cases where opponent might be unknown or AI
    const opponentName = isWhite ? match.blackPlayer : match.whitePlayer;
    const isAI = opponentName?.includes('Stockfish') || opponentName === 'Player 2';
    
    // Determine result using robust logic
    const result: 'win' | 'loss' | 'draw' = useMemo(() => {
        if (match.winner === 'Draw' || match.reason === 'Stalemate' || match.reason === 'Insufficient Material') return 'draw';
        
        // Check exact matches
        if (match.winner === 'White') return isWhite ? 'win' : 'loss';
        if (match.winner === 'Black') return !isWhite ? 'win' : 'loss';
        if (match.winner === 'You') return 'win';
        if (match.winner === currentUser) return 'win';
        
        // If winner is opponent name
        if (match.winner === opponentName) return 'loss';
        
        // Fallback: If I am White and winner is not White/Me, it's loss.
        return 'loss';
    }, [match, currentUser, isWhite, opponentName]);
    
    useEffect(() => {
        let mounted = true;
        const fetchOp = async () => {
            if(!opponentName || isAI) return;
            const data = await getUser(opponentName);
            if(mounted && data) setOpponent(data);
        };
        fetchOp();
        return () => { mounted = false; };
    }, [opponentName, isAI]);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '';
        const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp.seconds * 1000);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        // Less than 24 hours
        if (diff < 86400000) {
            if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
            return Math.floor(diff / 3600000) + 'h ago';
        }
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const getResultIcon = () => {
        switch(result) {
            case 'win': return <Trophy size={14} className="text-yellow-500 fill-yellow-500" />;
            case 'loss': return <XCircle size={14} className="text-destructive" />;
            case 'draw': return <Handshake size={14} className="text-muted-foreground" />;
        }
    };

    const getResultColor = () => {
        switch(result) {
            case 'win': return 'bg-green-500/10 border-green-500/20 hover:border-green-500/40';
            case 'loss': return 'bg-red-500/5 border-red-500/10 hover:border-red-500/30';
            case 'draw': return 'bg-muted/30 border-border hover:border-primary/20';
        }
    };

    return (
        <div className={`flex items-center justify-between p-3 rounded-xl border transition-all group relative overflow-hidden ${getResultColor()}`}>
            
            <div className="flex items-center gap-3 overflow-hidden flex-grow">
                {/* Result Icon Badge */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${
                    result === 'win' ? 'bg-background border-yellow-500/30' : 
                    result === 'loss' ? 'bg-background border-destructive/20' : 
                    'bg-background border-border'
                }`}>
                    {getResultIcon()}
                </div>

                {/* Avatar */}
                <div className="relative w-9 h-9 rounded-full bg-secondary border border-border overflow-hidden shrink-0 shadow-sm">
                    {opponent?.photoUrl ? (
                        <img src={opponent.photoUrl} alt={opponentName} className="w-full h-full object-cover" />
                    ) : (
                        <div className="flex items-center justify-center w-full h-full text-xs font-bold text-muted-foreground bg-muted">
                            {opponentName?.[0]?.toUpperCase() || "?"}
                        </div>
                    )}
                    {/* Color indicator */}
                    <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card ${isWhite ? 'bg-black' : 'bg-white'}`} title={isWhite ? "Opponent played Black" : "Opponent played White"}></div>
                </div>

                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs truncate text-foreground max-w-[100px]">{opponentName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className={`font-bold uppercase tracking-wider ${
                            result === 'win' ? 'text-green-600' : result === 'draw' ? 'text-muted-foreground' : 'text-destructive'
                        }`}>
                            {result === 'win' ? 'Victory' : result === 'draw' ? 'Draw' : 'Defeat'}
                        </span>
                        <span className="text-border">•</span>
                        <span>{formatDate(match.createdAt)}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 pl-2 shrink-0">
                {/* Elo Change Simulation */}
                <div className={`text-xs font-bold font-mono ${result === 'win' ? 'text-green-500' : result === 'loss' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {result === 'win' ? '+10' : result === 'loss' ? '-5' : '+2'}
                </div>

                {match.pgn && (
                    <button 
                        onClick={() => onReview && onReview(match.pgn)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-background border border-border hover:border-primary hover:text-primary transition-all shadow-sm"
                        title="Analyze Game"
                    >
                        <ChevronRight size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};

export const WalletLeaderboard: React.FC<WalletLeaderboardProps> = ({ wallet, onConnectRequest, isActive, onReviewGame, onSpectateGame }) => {
  const { addNotification } = useNotification();
  const [tonConnectUI] = useTonConnectUI();
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loadingLB, setLoadingLB] = useState(true);
  
  const [matchHistory, setMatchHistory] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any>({ games: 0, wins: 0, winRate: 0, photoUrl: '', balance: 0, referralEarnings: 0 });
  const [telegramUser, setTelegramUser] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  const [rightPanelTab, setRightPanelTab] = useState<'leaderboard' | 'online'>('online');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'win' | 'loss' | 'draw'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [referralLink, setReferralLink] = useState('');
  const [refCopied, setRefCopied] = useState(false);

  const processStats = (games: any[], username: string, profileData?: any) => {
      const totalGames = games.length;
      let wins = 0;
      games.forEach((g: any) => {
          const isWhite = g.whitePlayer === username;
          
          let isWin = false;
          if (g.winner === 'White') isWin = isWhite;
          else if (g.winner === 'Black') isWin = !isWhite;
          else if (g.winner === username) isWin = true;
          else if (g.winner === 'You') isWin = true;
          
          if (isWin) wins++;
      });
      // Fallback to local storage if photoUrl is missing in profileData (e.g. freshly logged in)
      const storedPhoto = localStorage.getItem('telegram_photo');
      return { 
          games: totalGames, 
          wins: wins, 
          winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
          photoUrl: profileData?.photoUrl || storedPhoto || '',
          balance: profileData?.balance || 0,
          referralEarnings: profileData?.referralEarnings || 0
      };
  };

  const fetchData = async () => {
    const username = localStorage.getItem('telegram_username');
    const telegramId = localStorage.getItem('telegram_id');
    setTelegramUser(username);
    
    if (username) {
        const refId = telegramId || username.replace(/[^a-zA-Z0-9_]/g, '');
        setReferralLink(`https://t.me/${BOT_USERNAME}?start=${refId}`);
        
        // Cache Check
        const cachedProfile = getFromCache(`user_${username}`, true);
        const cachedGames = getFromCache(`games_${username}`, true);
        
        if (cachedGames) {
            setMatchHistory(cachedGames);
            setUserStats(processStats(cachedGames, username, cachedProfile));
        } else if (cachedProfile) {
             const storedPhoto = localStorage.getItem('telegram_photo');
             setUserStats({ 
                 ...cachedProfile, 
                 photoUrl: cachedProfile.photoUrl || storedPhoto || '',
                 games: 0, wins: 0, winRate: 0 
             });
        }
    }

    const cachedLB = getFromCache('leaderboard', true);
    if (cachedLB) { 
        setLeaderboardData(cachedLB); 
        setLoadingLB(false); 
    }

    setRefreshing(true);
    
    const promises = [];
    if (username) {
        promises.push(
            getUser(username, true).then(async (profileData) => {
                 getUserGames(username, true).then(games => {
                     setMatchHistory(games);
                     setUserStats(processStats(games, username, profileData));
                 });
            })
        );
    }
    
    promises.push(
        getLeaderboard(true).then(lbData => {
             setLeaderboardData(lbData || []);
        })
    );

    await Promise.allSettled(promises);
    setLoadingLB(false);
    setRefreshing(false);
  };

  useEffect(() => { if (isActive) fetchData(); }, [isActive]);

  const handleDepositClick = () => { 
      if(!wallet.connected) { onConnectRequest(); return; } 
      setAmountInput('');
      setIsDepositModalOpen(true);
  };

  const handleWithdrawClick = () => { 
      if(!wallet.connected) { onConnectRequest(); return; } 
      setAmountInput('');
      setIsWithdrawModalOpen(true);
  };

  const confirmDeposit = async () => {
      const amount = parseFloat(amountInput);
      if (isNaN(amount) || amount <= 0) { 
          addNotification({ type: 'error', message: 'Invalid amount entered.' });
          return; 
      }
      setIsProcessing(true);
      try {
          const nanoTons = Math.floor(amount * 1000000000).toString();
          const transaction = {
              validUntil: Math.floor(Date.now() / 1000) + 600,
              messages: [{ address: "UQDgia6yOy3eR1b8Bhp0cE6e2icvNDieZIRww5SmrqIeuRjm", amount: nanoTons }]
          };
          await tonConnectUI.sendTransaction(transaction);
          addNotification({ type: 'success', message: 'Deposit successful!' });
          setIsDepositModalOpen(false);
      } catch (e) { 
          addNotification({ type: 'error', message: 'Deposit failed or cancelled.' });
      } finally { setIsProcessing(false); }
  };

  const confirmWithdraw = () => {
      addNotification({ type: 'info', message: 'Withdrawal request submitted.' });
      setIsWithdrawModalOpen(false);
  };

  const copyReferral = () => {
      navigator.clipboard.writeText(referralLink);
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 2000);
      addNotification({ type: 'success', message: 'Referral link copied!' });
  };

  const getMatchOutcome = (match: any) => {
      if (!telegramUser) return 'unknown';
      if (match.winner === 'Draw') return 'draw';
      
      const isWhite = match.whitePlayer === telegramUser;
      
      if (match.winner === 'White') return isWhite ? 'win' : 'loss';
      if (match.winner === 'Black') return !isWhite ? 'win' : 'loss';
      if (match.winner === telegramUser) return 'win';
      if (match.winner === 'You') return 'win'; 
      
      return 'loss';
  };

  const filteredHistory = matchHistory.filter(match => {
      if (historyFilter === 'all') return true;
      return getMatchOutcome(match) === historyFilter;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-6xl mx-auto p-4">
      <div className="flex flex-col gap-6">
        {/* Profile Card */}
        <LiquidCard className="p-6 relative overflow-hidden">
           <div className="flex justify-between items-start mb-6 z-10 relative">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary text-primary-foreground rounded-md">
                  <User size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Profile</h2>
                  <p className="text-xs text-muted-foreground">Stats & Identity</p>
                </div>
              </div>
           </div>

           {telegramUser ? (
             <div className="flex flex-col gap-4 z-10 relative">
                <div className="flex items-center gap-4 bg-muted/40 p-4 rounded-lg border border-border">
                   <div className="relative w-16 h-16 rounded-full bg-secondary flex items-center justify-center overflow-hidden border-2 border-primary/20 shadow-lg shrink-0">
                      <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-muted-foreground select-none">
                          {telegramUser.charAt(0).toUpperCase()}
                      </span>
                      {userStats.photoUrl && (
                         <img 
                            src={userStats.photoUrl} 
                            alt={telegramUser} 
                            className="relative z-10 w-full h-full object-cover bg-secondary"
                            onError={(e) => {e.currentTarget.style.display='none'}} 
                         />
                      )}
                   </div>
                   <div>
                      <h3 className="text-lg font-bold">@{telegramUser}</h3>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                        <Trophy size={10} className="text-yellow-500" /> EtherChess Player
                      </p>
                   </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                   <div className="p-3 bg-muted/30 rounded-md text-center border border-border">
                      <p className="text-[10px] text-muted-foreground font-bold mb-1 uppercase">Matches</p>
                      <p className="text-xl font-bold">{userStats.games}</p>
                   </div>
                   <div className="p-3 bg-muted/30 rounded-md text-center border border-border">
                      <p className="text-[10px] text-muted-foreground font-bold mb-1 uppercase">Wins</p>
                      <p className="text-xl font-bold">{userStats.wins}</p>
                   </div>
                   <div className="p-3 bg-muted/30 rounded-md text-center border border-border">
                      <p className="text-[10px] text-muted-foreground font-bold mb-1 uppercase">Win Rate</p>
                      <p className="text-xl font-bold">{userStats.winRate}%</p>
                   </div>
                </div>
             </div>
           ) : (
             <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Login via Telegram to track stats.</p>
             </div>
           )}
        </LiquidCard>

        {/* Wallet & Referral Card */}
        <LiquidCard className="p-8 flex flex-col justify-between flex-grow">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary text-primary-foreground rounded-md">
                  <Wallet size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Wallet & Referrals</h2>
                  <p className="text-xs text-muted-foreground">Balance: ${userStats.balance?.toFixed(2) || '0.00'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
                {/* Balance Display */}
                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg border border-border">
                    <div>
                        <p className="text-xs text-muted-foreground uppercase font-bold">Game Balance</p>
                        <h2 className="text-3xl font-bold">${userStats.balance?.toFixed(2) || '0.00'}</h2>
                    </div>
                    <div className="flex gap-2">
                        <LiquidButton onClick={handleDepositClick} variant="primary" className="h-8 text-xs"><ArrowDownLeft size={12} className="mr-1"/> Add</LiquidButton>
                        <LiquidButton onClick={handleWithdrawClick} variant="secondary" className="h-8 text-xs"><ArrowUpRight size={12} className="mr-1"/> Cashout</LiquidButton>
                    </div>
                </div>

                {/* Referral Section */}
                <div className="bg-gradient-to-r from-indigo-900/10 to-purple-900/10 p-4 rounded-lg border border-indigo-500/20">
                     <div className="flex items-center gap-2 mb-2">
                         <Gift size={16} className="text-indigo-500"/>
                         <h3 className="font-bold text-sm">Refer & Earn</h3>
                     </div>
                     <p className="text-xs text-muted-foreground mb-4">Invite friends to join EtherChess tournaments and climb the ranks together.</p>
                     
                     <div className="flex gap-2 mb-3">
                         <div className="flex-grow bg-background border border-input rounded-md px-3 py-1.5 text-xs font-mono flex items-center overflow-hidden whitespace-nowrap">
                             {referralLink || "Login to get link"}
                         </div>
                         <button onClick={copyReferral} className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-3 rounded-md transition-colors" disabled={!referralLink}>
                             {refCopied ? <CheckCircle2 size={16} className="text-green-500"/> : <Copy size={16}/>}
                         </button>
                     </div>

                     <div className="flex justify-between items-center text-xs">
                         <span className="text-muted-foreground">Total Earnings:</span>
                         <span className="font-bold text-green-500">+${userStats.referralEarnings?.toFixed(2) || '0.00'}</span>
                     </div>
                </div>
            </div>
          </div>
        </LiquidCard>
      </div>

      <div className="flex flex-col gap-6">
          <LiquidCard className="p-0 flex flex-col h-[400px] overflow-hidden">
             <div className="p-4 border-b border-border bg-muted/20 flex flex-col gap-2">
               <div className="flex justify-between items-center">
                   <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-primary/10 text-primary rounded-md"><History size={16} /></div>
                      <div><h2 className="text-sm font-bold">Match History</h2></div>
                   </div>
                   {refreshing && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
               </div>
               {/* Filter Tabs */}
               <div className="flex items-center gap-1 mt-1 overflow-x-auto no-scrollbar">
                   {(['all', 'win', 'loss', 'draw'] as const).map(f => (
                       <button
                           key={f}
                           onClick={() => setHistoryFilter(f)}
                           className={`px-3 py-1.5 rounded-full text-[10px] uppercase font-bold transition-all border shrink-0 ${
                               historyFilter === f 
                               ? 'bg-primary text-primary-foreground border-primary' 
                               : 'bg-background text-muted-foreground border-border hover:bg-muted'
                           }`}
                       >
                           {f}
                       </button>
                   ))}
               </div>
             </div>
             <div className="flex-grow overflow-auto custom-scrollbar p-3 bg-muted/10">
                {filteredHistory.length > 0 ? (
                    <div className="space-y-3">
                        {filteredHistory.map((match: any) => (
                            <MatchHistoryItem 
                                key={match.id} 
                                match={match} 
                                currentUser={telegramUser} 
                                onReview={onReviewGame} 
                            />
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs opacity-50">
                        <History size={24} className="mb-2"/>
                        <p>{loadingLB ? 'Fetching history...' : 'No matches found.'}</p>
                    </div>
                )}
             </div>
          </LiquidCard>

          <LiquidCard className="p-0 flex flex-col flex-grow overflow-hidden min-h-[400px]">
             <div className="p-3 border-b border-border bg-muted/20">
                 <LiquidSwitch 
                     options={[
                         { value: 'online', label: 'Online Lobby', icon: <Globe size={14}/> },
                         { value: 'leaderboard', label: 'Ranking', icon: <Trophy size={14}/> }
                     ]}
                     activeValue={rightPanelTab}
                     onChange={(v) => setRightPanelTab(v as 'leaderboard' | 'online')}
                 />
             </div>
             
             <div className="flex-grow overflow-hidden p-0 relative">
                 {rightPanelTab === 'online' ? (
                     <div className="absolute inset-0 p-3 overflow-hidden">
                        <OnlinePlayers 
                            currentUser={telegramUser || ''}
                            onChallengeSent={(target) => {}}
                            onSpectate={onSpectateGame}
                        />
                     </div>
                 ) : (
                     <div className="absolute inset-0 flex flex-col overflow-hidden">
                        {/* Search Header */}
                        <div className="p-3 border-b border-border bg-background/50 backdrop-blur-sm z-10">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                                <input 
                                    type="text" 
                                    placeholder="Search players..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-muted/50 border border-border rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-grow overflow-y-auto custom-scrollbar p-3">
                             {loadingLB ? (
                                 <div className="flex flex-col items-center justify-center h-48 text-muted-foreground opacity-60">
                                     <RefreshCw className="animate-spin mb-2" size={24} />
                                     <span className="text-xs font-medium">Loading rankings...</span>
                                 </div>
                             ) : leaderboardData.length === 0 ? (
                                <div className="text-center py-10 opacity-50 text-xs flex flex-col items-center">
                                    <Trophy size={24} className="mb-2"/> No ranking data available.
                                </div>
                             ) : (
                                 <>
                                     {/* Top 3 Podium (Visual only if no search) */}
                                     {!searchQuery && leaderboardData.length >= 3 && (
                                         <div className="flex items-end justify-center gap-2 mb-6 mt-2 pb-4 border-b border-border/50">
                                             {/* 2nd Place */}
                                             <div className="flex flex-col items-center">
                                                 <div className="relative w-12 h-12 rounded-full border-2 border-slate-300 overflow-hidden mb-2 shadow-lg">
                                                     <img src={leaderboardData[1].avatar || ""} className="w-full h-full object-cover bg-muted" onError={(e)=>{e.currentTarget.style.display='none'}}/>
                                                     <div className="absolute inset-0 flex items-center justify-center bg-slate-300 text-slate-800 font-bold text-lg" style={{display: leaderboardData[1].avatar ? 'none' : 'flex'}}>{leaderboardData[1].username?.[0] || "?"}</div>
                                                 </div>
                                                 <div className="bg-slate-200 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded-full -mt-4 z-10 shadow-sm">#2</div>
                                                 <span className="text-xs font-bold mt-1 max-w-[60px] truncate">{leaderboardData[1].username || "Unknown"}</span>
                                                 <span className="text-[10px] text-muted-foreground">{leaderboardData[1].rating}</span>
                                             </div>

                                             {/* 1st Place */}
                                             <div className="flex flex-col items-center -mt-4">
                                                 <Crown size={20} className="text-yellow-500 fill-yellow-500 mb-1 animate-bounce-slow" />
                                                 <div className="relative w-16 h-16 rounded-full border-4 border-yellow-500 overflow-hidden mb-2 shadow-[0_0_15px_rgba(234,179,8,0.4)]">
                                                     <img src={leaderboardData[0].avatar || ""} className="w-full h-full object-cover bg-muted" onError={(e)=>{e.currentTarget.style.display='none'}}/>
                                                     <div className="absolute inset-0 flex items-center justify-center bg-yellow-500 text-yellow-900 font-bold text-xl" style={{display: leaderboardData[0].avatar ? 'none' : 'flex'}}>{leaderboardData[0].username?.[0] || "?"}</div>
                                                 </div>
                                                 <div className="bg-yellow-500 text-yellow-950 text-[10px] font-bold px-3 py-0.5 rounded-full -mt-5 z-10 shadow-sm">#1</div>
                                                 <span className="text-sm font-bold mt-1 max-w-[80px] truncate">{leaderboardData[0].username || "Unknown"}</span>
                                                 <span className="text-xs font-bold text-primary">{leaderboardData[0].rating}</span>
                                             </div>

                                             {/* 3rd Place */}
                                             <div className="flex flex-col items-center">
                                                 <div className="relative w-12 h-12 rounded-full border-2 border-amber-600 overflow-hidden mb-2 shadow-lg">
                                                     <img src={leaderboardData[2].avatar || ""} className="w-full h-full object-cover bg-muted" onError={(e)=>{e.currentTarget.style.display='none'}}/>
                                                     <div className="absolute inset-0 flex items-center justify-center bg-amber-600 text-amber-100 font-bold text-lg" style={{display: leaderboardData[2].avatar ? 'none' : 'flex'}}>{leaderboardData[2].username?.[0] || "?"}</div>
                                                 </div>
                                                 <div className="bg-amber-600 text-amber-100 text-[10px] font-bold px-2 py-0.5 rounded-full -mt-4 z-10 shadow-sm">#3</div>
                                                 <span className="text-xs font-bold mt-1 max-w-[60px] truncate">{leaderboardData[2].username || "Unknown"}</span>
                                                 <span className="text-[10px] text-muted-foreground">{leaderboardData[2].rating}</span>
                                             </div>
                                         </div>
                                     )}

                                     <div className="space-y-2">
                                        {leaderboardData
                                            .filter(p => p.username && p.username.toLowerCase().includes((searchQuery || '').toLowerCase()))
                                            .map((player) => (
                                            <div key={player.id} className={`
                                                relative flex items-center justify-between p-3 rounded-xl border transition-all duration-300 group
                                                ${player.username === telegramUser ? 'border-primary/50 bg-primary/5 shadow-[0_0_20px_rgba(var(--primary),0.1)] z-10' : 'border-transparent bg-muted/30 hover:bg-muted/60 hover:border-border'}
                                                ${player.rank === 1 && !searchQuery ? 'border-yellow-500/20 bg-yellow-500/5' : ''}
                                                ${player.rank === 2 && !searchQuery ? 'border-slate-300/20 bg-slate-300/5' : ''}
                                                ${player.rank === 3 && !searchQuery ? 'border-amber-600/20 bg-amber-600/5' : ''}
                                            `}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`
                                                        w-8 h-8 flex items-center justify-center rounded-lg font-bold text-xs shadow-sm shrink-0
                                                        ${player.rank === 1 ? "bg-yellow-500 text-yellow-950" : 
                                                          player.rank === 2 ? "bg-slate-300 text-slate-900" :
                                                          player.rank === 3 ? "bg-amber-700 text-amber-100" :
                                                          "bg-background text-muted-foreground border border-border"}
                                                    `}>
                                                        {player.rank}
                                                    </div>
                                                    
                                                    <div className="relative w-9 h-9 rounded-full bg-secondary border border-border overflow-hidden shrink-0">
                                                         {player.avatar && (
                                                             <img src={player.avatar} alt={player.username} className="w-full h-full object-cover" onError={(e) => {e.currentTarget.style.display='none'}}/>
                                                         )}
                                                         <div className={`absolute inset-0 flex items-center justify-center font-bold text-xs text-muted-foreground ${player.avatar ? 'opacity-0' : 'opacity-100'}`}>
                                                             {player.username?.[0]?.toUpperCase() || "?"}
                                                         </div>
                                                    </div>
                                                    
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`text-xs font-bold ${player.username === telegramUser ? 'text-primary' : 'text-foreground'}`}>
                                                                {player.username}
                                                            </span>
                                                            {player.title && <span className="text-[8px] bg-primary text-primary-foreground px-1 py-px rounded-[2px] font-black uppercase tracking-tighter">{player.title}</span>}
                                                            {player.username === telegramUser && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"/>}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            Won {player.winRate}% of games
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                     <span className="block text-sm font-black font-mono tracking-tight">{player.rating}</span>
                                                </div>
                                            </div>
                                        ))}
                                     </div>
                                 </>
                             )}
                        </div>
                    </div>
                 )}
             </div>
          </LiquidCard>
      </div>

      <LiquidModal isOpen={isDepositModalOpen} onClose={() => setIsDepositModalOpen(false)} title="Deposit Credits">
          <div className="flex flex-col gap-4">
             <div className="bg-muted/50 p-4 rounded-lg text-sm border border-border">
                 <p className="text-muted-foreground mb-1 text-xs uppercase font-bold">1 Credit = $1.00 USD</p>
                 <p className="mb-2 text-xs">Simulated payment gateway.</p>
             </div>
             <div>
                 <label className="text-xs font-bold mb-1 block">Amount ($)</label>
                 <input type="number" placeholder="10" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className="w-full p-3 rounded-md bg-background border border-input font-mono text-lg" autoFocus />
             </div>
             <div className="flex gap-3 mt-2">
                 <LiquidButton variant="secondary" onClick={() => setIsDepositModalOpen(false)} disabled={isProcessing} className="flex-1">Cancel</LiquidButton>
                 <LiquidButton variant="primary" onClick={confirmDeposit} isLoading={isProcessing} className="flex-1">Deposit</LiquidButton>
             </div>
         </div>
      </LiquidModal>

      <LiquidModal isOpen={isWithdrawModalOpen} onClose={() => setIsWithdrawModalOpen(false)} title="Withdraw Credits">
          <div className="flex flex-col gap-4">
             <div className="bg-muted/50 p-4 rounded-lg text-sm border border-border">
                 <p className="text-muted-foreground mb-1 text-xs uppercase font-bold">Available</p>
                 <p className="font-bold text-foreground">${userStats.balance?.toFixed(2)}</p>
             </div>
             <div>
                 <label className="text-xs font-bold mb-1 block">Amount ($)</label>
                 <input type="number" placeholder="10" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className="w-full p-3 rounded-md bg-background border border-input font-mono text-lg" autoFocus />
             </div>
             <div className="flex gap-3 mt-2">
                 <LiquidButton variant="secondary" onClick={() => setIsWithdrawModalOpen(false)} disabled={isProcessing} className="flex-1">Cancel</LiquidButton>
                 <LiquidButton variant="primary" onClick={confirmWithdraw} isLoading={isProcessing} className="flex-1">Withdraw</LiquidButton>
             </div>
         </div>
      </LiquidModal>
    </div>
  );
};
