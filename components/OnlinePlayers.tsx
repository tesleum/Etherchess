
import React, { useState, useEffect, useRef } from 'react';
import { 
    subscribeToPlayers, sendChallenge, joinMatchmakingQueue, leaveMatchmakingQueue, 
    findOpponentAndCreateGame, createInviteLink, sendLobbyMessage, getLobbyChatHistory,
    subscribeToActiveGamesList, notifyUser,
    createTournament, joinTournament, leaveTournament, subscribeToTournaments
} from '../services/firebase';
import { socketService } from '../services/socketService';
import { LiquidButton, LiquidSwitch, LiquidBadge } from './LiquidUI';
import { 
    User, Clock, CheckCircle2, Zap, Share2, Copy, Send, Play, 
    Users, Signal, MessageCircle, Eye, Timer, Trophy, Plus, LogIn, XCircle
} from 'lucide-react';
import { BOT_USERNAME } from '../config';
import { LobbyMessage, Tournament } from '../types';
import { useNotification } from './NotificationSystem';

interface OnlinePlayersProps {
  currentUser: string;
  onChallengeSent: (username: string) => void;
  onSpectate?: (gameId: string) => void;
}

const TIME_CONTROLS = [
    { label: 'Bullet 1m', value: 60 },
    { label: 'Blitz 3m', value: 180 },
    { label: 'Blitz 5m', value: 300 },
    { label: 'Rapid 10m', value: 600 }
];

const MSG_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
const JOIN_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3'); // Success sound for tournament

const UserAvatar = ({ username, className = "w-8 h-8", onlineUsers = [], showOnlineStatus = false }: { username: string, className?: string, onlineUsers?: any[], showOnlineStatus?: boolean }) => {
    const user = onlineUsers.find(u => u.username === username);
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar || null);
    
    useEffect(() => {
        if (!avatarUrl && username) {
             try {
                 const cached = localStorage.getItem(`etherchess_cache_user_${username}`);
                 if (cached) {
                     const data = JSON.parse(cached);
                     if (data?.data?.photoUrl) setAvatarUrl(data.data.photoUrl);
                 }
             } catch(e) {}
        } else if (user?.avatar && user.avatar !== avatarUrl) {
            setAvatarUrl(user.avatar);
        }
    }, [username, avatarUrl, user]);

    return (
        <div className={`relative rounded-full bg-secondary flex items-center justify-center border border-border overflow-hidden shrink-0 shadow-sm ${className}`}>
            {avatarUrl ? (
                <img src={avatarUrl} alt={username} className="w-full h-full object-cover" onError={(e) => {e.currentTarget.style.display='none'}} />
            ) : (
                <span className="font-bold text-muted-foreground opacity-50">{username?.[0]?.toUpperCase()}</span>
            )}
            {showOnlineStatus && user?.isOnline && (
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-card rounded-full animate-pulse"></div>
            )}
        </div>
    );
};

export const OnlinePlayers: React.FC<OnlinePlayersProps> = ({ currentUser, onChallengeSent, onSpectate }) => {
  const { addNotification } = useNotification();
  const [tab, setTab] = useState<'lobby' | 'games' | 'chat' | 'tournaments'>('lobby');
  
  // Lobby Data
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [lobbyMessages, setLobbyMessages] = useState<LobbyMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Matchmaking State
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [selectedTimeControl, setSelectedTimeControl] = useState(600); // Default 10 min
  
  // Invite State
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Tournament State
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentName, setTournamentName] = useState('');
  const [creatingTournament, setCreatingTournament] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewerName = currentUser || "guest_viewer";
    
    // 1. Players
    const unsubPlayers = subscribeToPlayers(viewerName, (users) => {
        const sorted = users.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        setOnlineUsers(sorted);
        setLoading(false);
    });

    // 2. Active Games
    const unsubGames = subscribeToActiveGamesList((games) => {
        setActiveGames(games);
    });

    // 3. Lobby Chat
    getLobbyChatHistory().then(msgs => {
        setLobbyMessages(msgs);
        scrollToBottom();
    });

    socketService.connect();
    const unsubSocket = socketService.subscribe((data) => {
        if (data.type === 'LOBBY') {
            const newMessage: LobbyMessage = {
                id: data.id || Date.now().toString() + Math.random(),
                sender: data.sender,
                text: data.text,
                timestamp: data.timestamp,
                avatar: data.avatar
            };
            
            setLobbyMessages(prev => {
                if (prev.some(m => (m.id === newMessage.id) || (m.timestamp === newMessage.timestamp && m.sender === newMessage.sender))) return prev;
                return [...prev, newMessage];
            });

            if (data.sender !== currentUser) {
                MSG_SOUND.currentTime = 0;
                MSG_SOUND.volume = 0.5;
                MSG_SOUND.play().catch(() => {});
            }

            scrollToBottom();
        }
    });
    
    // 4. Tournaments
    const unsubTournaments = subscribeToTournaments((data) => {
        setTournaments(data);
    });

    return () => { unsubPlayers(); unsubGames(); unsubSocket(); unsubTournaments(); };
  }, [currentUser]);

  const scrollToBottom = () => {
      setTimeout(() => {
          if (chatEndRef.current) {
              chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
      }, 100);
  };

  useEffect(() => {
      let interval: ReturnType<typeof setInterval>;
      if (isSearching) {
          interval = setInterval(async () => {
              setSearchTime(prev => prev + 1);
              const success = await findOpponentAndCreateGame(currentUser, 1200, selectedTimeControl);
              if (success) { setIsSearching(false); setSearchTime(0); }
          }, 2000);
      } else { setSearchTime(0); }
      return () => clearInterval(interval);
  }, [isSearching, currentUser, selectedTimeControl]);

  const toggleMatchmaking = async () => {
      if (isSearching) { 
          setIsSearching(false); 
          await leaveMatchmakingQueue(currentUser); 
          addNotification({ type: 'info', message: 'Matchmaking cancelled.' });
      } else { 
          setIsSearching(true); 
          await joinMatchmakingQueue(currentUser, 1200, selectedTimeControl); 
          addNotification({ type: 'info', message: 'Looking for a match...' });
      }
  };

  const handleCreateInvite = async () => {
      if (creatingInvite || !currentUser) return;
      setCreatingInvite(true);
      try {
          const id = await createInviteLink(currentUser);
          if (id) {
              setInviteLink(`https://t.me/${BOT_USERNAME}?start=invite_${id}`);
              addNotification({ type: 'success', message: 'Invite link created!' });
          }
      } catch (e) {} finally { setCreatingInvite(false); }
  };

  const copyInvite = () => {
      if (inviteLink) { 
          navigator.clipboard.writeText(inviteLink); 
          setCopied(true); 
          setTimeout(() => setCopied(false), 2000);
          addNotification({ type: 'success', message: 'Copied to clipboard' });
      }
  };

  const handleChallenge = async (targetUser: any) => {
      await sendChallenge(currentUser, targetUser.username);
      await notifyUser(
          targetUser.username, 
          `⚔️ *New Challenge!*\n\nUser *${currentUser}* has challenged you to a game on EtherChess.\n\nOpen the app to accept.`
      );
      addNotification({ type: 'success', title: 'Challenge Sent', message: `Challenge sent to ${targetUser.username}` });
      if (onChallengeSent) onChallengeSent(targetUser.username);
  };

  const handleCreateTournament = async () => {
      if (!currentUser || !tournamentName.trim()) return;
      setCreatingTournament(true);
      try {
          await createTournament(tournamentName.trim(), selectedTimeControl, currentUser);
          addNotification({ type: 'success', message: 'Tournament created!' });
          setTournamentName('');
      } catch (e: any) {
          addNotification({ type: 'error', message: 'Failed to create tournament' });
      } finally {
          setCreatingTournament(false);
      }
  };

  const handleJoinTournament = async (t: Tournament) => {
      if (!currentUser) return;
      if (t.participants && t.participants[currentUser]) {
          // Leave
          if(confirm("Leave tournament?")) await leaveTournament(t.id, currentUser);
      } else {
          // Join
          const avatar = localStorage.getItem('telegram_photo') || '';
          await joinTournament(t.id, currentUser, currentUser, avatar);
          addNotification({ type: 'success', message: 'Joined tournament!' });
          
          // Play Join Sound
          JOIN_SOUND.currentTime = 0;
          JOIN_SOUND.volume = 0.6;
          JOIN_SOUND.play().catch(() => {});
      }
  };

  const handleSendChat = async () => {
      if (!chatInput.trim() || !currentUser) return;
      
      const text = chatInput.trim();
      setChatInput('');
      
      const avatar = localStorage.getItem('telegram_photo') || '';
      const timestamp = Date.now();
      const id = timestamp.toString() + Math.random().toString();

      const msgData = {
          type: 'LOBBY',
          sender: currentUser,
          text: text,
          timestamp: timestamp,
          avatar: avatar,
          id: id
      };
      
      const newMessage: LobbyMessage = {
          id: id,
          sender: currentUser,
          text: text,
          timestamp: timestamp,
          avatar: avatar
      };
      setLobbyMessages(prev => [...prev, newMessage]);
      scrollToBottom();
      
      socketService.send(msgData as any);
      await sendLobbyMessage(currentUser, text, avatar);
  };

  if (loading) {
      return (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
              <Signal className="animate-pulse text-primary" size={32} />
              <span className="text-xs font-medium tracking-widest uppercase">Syncing Lobby...</span>
          </div>
      );
  }

  return (
    <div className="flex flex-col gap-4 h-full p-2">
        <div className="flex justify-center mb-1 shrink-0">
            <LiquidSwitch 
                options={[
                    { value: 'lobby', label: 'Play', icon: <User size={14}/> },
                    { value: 'games', label: `Games (${activeGames.length})`, icon: <Eye size={14}/> },
                    { value: 'chat', label: 'Chat', icon: <MessageCircle size={14}/> },
                    { value: 'tournaments', label: 'Events', icon: <Trophy size={14}/> }
                ]}
                activeValue={tab}
                onChange={(v) => setTab(v as any)}
            />
        </div>

        {tab === 'lobby' && (
            <div className="flex flex-col flex-grow min-h-0 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-muted/30 p-3 rounded-lg border border-border mb-3 shrink-0">
                    <div className="flex justify-between items-center mb-2">
                         <span className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1"><Timer size={12}/> Time Control</span>
                         <select 
                            value={selectedTimeControl} 
                            onChange={(e) => setSelectedTimeControl(Number(e.target.value))}
                            disabled={isSearching}
                            className="text-xs bg-background border border-input rounded px-2 py-1 outline-none focus:ring-1 ring-primary"
                         >
                            {TIME_CONTROLS.map(tc => <option key={tc.value} value={tc.value}>{tc.label}</option>)}
                         </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <LiquidButton 
                            variant={isSearching ? "danger" : "primary"} 
                            onClick={toggleMatchmaking}
                            disabled={!currentUser}
                            className={`flex flex-col items-center justify-center py-3 h-auto gap-1 ${isSearching ? 'animate-pulse' : ''}`}
                        >
                            {isSearching ? <Clock size={16}/> : <Zap size={16} />}
                            <span className="text-xs font-bold">{isSearching ? `Searching ${searchTime}s` : 'Quick Match'}</span>
                        </LiquidButton>

                        <LiquidButton 
                            variant="secondary"
                            onClick={handleCreateInvite}
                            disabled={creatingInvite || !currentUser}
                            className="flex flex-col items-center justify-center py-3 h-auto gap-1"
                        >
                            <Share2 size={16} />
                            <span className="text-xs font-bold">{creatingInvite ? '...' : 'Invite'}</span>
                        </LiquidButton>
                    </div>
                     {inviteLink && (
                        <div className="mt-2 bg-background p-2 rounded border border-border flex items-center justify-between shadow-sm animate-in zoom-in">
                            <div className="text-[10px] truncate mr-2 font-mono select-all text-muted-foreground">{inviteLink}</div>
                            <button onClick={copyInvite}>{copied ? <CheckCircle2 size={14} className="text-green-500"/> : <Copy size={14}/>}</button>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 mb-2 px-1 shrink-0">
                     <span className="text-[10px] font-bold text-muted-foreground uppercase">Online Players ({onlineUsers.length})</span>
                     <div className="h-px bg-border flex-grow"></div>
                </div>

                <div className="flex-grow overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {onlineUsers.length === 0 ? (
                        <div className="text-center py-8 text-xs text-muted-foreground flex flex-col items-center">
                            <Users size={24} className="mb-2 opacity-20"/>
                            No other players online right now.
                        </div>
                    ) : (
                        onlineUsers.map((user) => (
                            <div key={user.username} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl transition-all hover:border-primary/30 group">
                                <div className="flex items-center gap-3">
                                    <UserAvatar username={user.username} onlineUsers={onlineUsers} showOnlineStatus={true} className="w-10 h-10" />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-foreground leading-none">{user.username}</span>
                                        <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                            <span className="font-mono text-primary">{user.rating}</span> Elo
                                            {user.isOnline && <span className="w-1 h-1 bg-green-500 rounded-full ml-1"></span>}
                                        </span>
                                    </div>
                                </div>
                                <LiquidButton 
                                    variant="secondary" 
                                    className="!py-1.5 !px-3 !text-xs h-8" 
                                    onClick={() => handleChallenge(user)} 
                                    disabled={!currentUser}
                                >
                                    Challenge
                                </LiquidButton>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}

        {tab === 'games' && (
            <div className="flex flex-col flex-grow min-h-0 animate-in fade-in slide-in-from-bottom-2">
                <div className="text-center mb-2 shrink-0">
                     <p className="text-xs text-muted-foreground">Watch live matches from around the world.</p>
                </div>
                <div className="flex-grow overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {activeGames.length === 0 ? (
                        <div className="text-center py-10 opacity-50 text-xs flex flex-col items-center">
                            <Eye size={24} className="mb-2"/> No active games.
                        </div>
                    ) : (
                        activeGames.map((game) => (
                             <div key={game.id} className="p-3 bg-card border border-border rounded-lg hover:shadow-md transition-all flex flex-col gap-2">
                                 <div className="flex justify-between items-center">
                                     <div className="flex items-center gap-2">
                                         <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                         <span className="text-[10px] font-mono text-muted-foreground uppercase">Live</span>
                                     </div>
                                     <LiquidBadge color="bg-secondary">{game.timeControl ? Math.floor(game.timeControl/60)+' min' : '10 min'}</LiquidBadge>
                                 </div>
                                 <div className="flex justify-between items-center px-1">
                                     <div className="flex items-center gap-2">
                                         <UserAvatar username={game.whitePlayer} onlineUsers={onlineUsers} className="w-8 h-8" />
                                         <div className="flex flex-col items-start">
                                             <span className="text-xs font-bold">{game.whitePlayer}</span>
                                             <span className="text-[10px] text-muted-foreground">White</span>
                                         </div>
                                     </div>
                                     <div className="text-xs text-muted-foreground font-mono px-2">vs</div>
                                     <div className="flex items-center gap-2">
                                         <div className="flex flex-col items-end">
                                             <span className="text-xs font-bold">{game.blackPlayer}</span>
                                             <span className="text-[10px] text-muted-foreground">Black</span>
                                         </div>
                                         <UserAvatar username={game.blackPlayer} onlineUsers={onlineUsers} className="w-8 h-8" />
                                     </div>
                                 </div>
                                 <LiquidButton 
                                     onClick={() => onSpectate && onSpectate(game.id)} 
                                     variant="primary" 
                                     className="w-full h-8 text-xs mt-1"
                                 >
                                     <Eye size={12} className="mr-2"/> Spectate
                                 </LiquidButton>
                             </div>
                        ))
                    )}
                </div>
            </div>
        )}

        {tab === 'chat' && (
             <div className="flex flex-col flex-grow min-h-0 animate-in fade-in slide-in-from-bottom-2">
                 <div 
                    ref={chatContainerRef}
                    className="flex-grow overflow-y-auto custom-scrollbar p-3 space-y-4 bg-muted/20 rounded-xl border border-border mb-3"
                 >
                     {lobbyMessages.length === 0 ? (
                         <div className="text-center py-20 text-xs text-muted-foreground opacity-50 flex flex-col items-center">
                             <MessageCircle className="mb-2 opacity-50"/>
                             Welcome to Global Chat
                         </div>
                     ) : (
                        <div className="flex flex-col justify-end min-h-full space-y-3">
                            {lobbyMessages.map((msg, i) => {
                                const isMe = msg.sender === currentUser;
                                return (
                                    <div key={`${msg.id}-${i}`} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                         <div className="shrink-0">
                                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold border border-border overflow-hidden shadow-sm">
                                                {msg.avatar ? (
                                                    <img src={msg.avatar} alt={msg.sender} className="w-full h-full object-cover" onError={(e) => {e.currentTarget.style.display='none'}} />
                                                ) : (
                                                    <span>{msg.sender[0]?.toUpperCase()}</span>
                                                )}
                                            </div>
                                         </div>
                                         <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                                             <div className="flex items-center gap-2 mb-1">
                                                 <span className="text-[10px] font-bold text-foreground">{msg.sender}</span>
                                                 <span className="text-[9px] text-muted-foreground">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                             </div>
                                             <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed shadow-sm break-words ${
                                                 isMe 
                                                     ? 'bg-primary text-primary-foreground rounded-tr-none' 
                                                     : 'bg-card border border-border rounded-tl-none'
                                             }`}>
                                                 {msg.text}
                                             </div>
                                         </div>
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef}></div>
                        </div>
                     )}
                 </div>
                 
                 <div className="flex gap-2 shrink-0 bg-background pt-1">
                     <input 
                        type="text" 
                        value={chatInput} 
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                        placeholder="Type a message..."
                        className="flex-grow bg-muted/50 border border-border rounded-full px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
                     />
                     <button 
                        onClick={handleSendChat} 
                        disabled={!chatInput.trim()} 
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                     >
                         <Send size={16} className={chatInput.trim() ? 'ml-0.5' : ''}/>
                     </button>
                 </div>
             </div>
        )}

        {tab === 'tournaments' && (
            <div className="flex flex-col flex-grow min-h-0 animate-in fade-in slide-in-from-bottom-2">
                <div className="mb-4 shrink-0 bg-muted/20 p-3 rounded-lg border border-border">
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Host Tournament</p>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="Tournament Name" 
                            value={tournamentName}
                            onChange={(e) => setTournamentName(e.target.value)}
                            className="flex-grow bg-background border border-input rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                         <select 
                            value={selectedTimeControl} 
                            onChange={(e) => setSelectedTimeControl(Number(e.target.value))}
                            className="text-xs bg-background border border-input rounded px-2 py-1 outline-none focus:ring-1 ring-primary w-20"
                         >
                            {TIME_CONTROLS.map(tc => <option key={tc.value} value={tc.value}>{tc.label}</option>)}
                         </select>
                        <button 
                            onClick={handleCreateTournament}
                            disabled={creatingTournament || !currentUser || !tournamentName}
                            className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                        >
                            {creatingTournament ? <Clock size={12} className="animate-spin"/> : <Plus size={12}/>} Create
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2 py-2 shrink-0">
                    <div className="h-px bg-border flex-grow"></div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Active Tournaments</span>
                    <div className="h-px bg-border flex-grow"></div>
                </div>

                <div className="flex-grow overflow-y-auto custom-scrollbar space-y-2">
                    {tournaments.length === 0 ? (
                        <div className="text-center py-10 opacity-50 text-xs flex flex-col items-center">
                            <Trophy size={24} className="mb-2"/> No tournaments active.
                        </div>
                    ) : (
                        tournaments.map((t) => {
                            const isParticipant = t.participants && currentUser && t.participants[currentUser];
                            const count = t.participants ? Object.keys(t.participants).length : 0;
                            return (
                                <div key={t.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-lg group hover:border-primary/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-yellow-500/10 text-yellow-600 rounded-lg flex items-center justify-center">
                                            <Trophy size={20}/>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold">{t.name}</span>
                                            <span className="text-[10px] text-muted-foreground">Host: {t.host} • {Math.floor(t.timeControl/60)} min • {count} players</span>
                                        </div>
                                    </div>
                                    <LiquidButton 
                                        onClick={() => handleJoinTournament(t)} 
                                        variant={isParticipant ? "secondary" : "primary"} 
                                        className="h-8 text-xs px-3"
                                        disabled={!currentUser}
                                    >
                                        {isParticipant ? <><XCircle size={12} className="mr-1"/> Leave</> : <><LogIn size={12} className="mr-1" /> Join</>}
                                    </LiquidButton>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        )}
    </div>
  );
};
