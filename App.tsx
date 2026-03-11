
import React, { useState, useEffect } from 'react';
import { HashRouter } from 'react-router-dom'; 
import { Sun, Moon, Gamepad2, Wallet, Users, Hexagon, Crown, Trophy, LogOut, CheckCircle2, Copy, Swords, Target, User, Bell, Trash2, Info, AlertTriangle, AlertCircle, Shield } from 'lucide-react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { ChessGame } from './components/ChessGame';
import { WalletLeaderboard } from './components/WalletLeaderboard';
import { TrainingHub } from './components/TrainingHub';
import { TelegramLoginWidget } from './components/TelegramLoginWidget';
import { AdminPanel } from './components/AdminPanel';
import { AppTab, Theme, WalletState, Challenge, UserData } from './types';
import { LiquidButton, LiquidModal, LiquidCard } from './components/LiquidUI';
import { saveUser, updateUserPresence, subscribeToChallenges, respondToChallenge, subscribeToActiveUserGame, getChallenge, acceptInvite, setupPresence } from './services/firebase';
import { BACKEND_URL } from './config';
import { NotificationProvider, useNotification } from './components/NotificationSystem';

const ACCEPT_SOUND = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3');

function AppContent() {
  const { addNotification, history, unreadCount, clearHistory, markAllRead } = useNotification();
  const [theme, setTheme] = useState<Theme>('dark');
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.PLAY);
  const [currentUser, setCurrentUser] = useState<string>(localStorage.getItem('telegram_username') || '');
  const [gameToLoad, setGameToLoad] = useState<{ pgn: string } | null>(null);
  const [onlineGameId, setOnlineGameId] = useState<string | null>(null);
  const [incomingChallenge, setIncomingChallenge] = useState<Challenge | null>(null);
  const [wallet, setWallet] = useState<WalletState>({ connected: false, address: null, balance: 0 });
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  
  // Pending Invite Link (Ref Code is now handled immediately)
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // --- INITIALIZATION & FORCE SAVE ---
  useEffect(() => {
     const initApp = async () => {
         // 1. Get Start Params (Referral or Invite)
         const urlParams = new URLSearchParams(window.location.search);
         let startParam = urlParams.get('start') || urlParams.get('ref') || urlParams.get('tgWebAppStartParam');
         
         // 2. Get Telegram User Data
         let user = null;
         if ((window as any).Telegram?.WebApp) {
            const tg = (window as any).Telegram.WebApp;
            tg.ready();
            try { tg.expand(); } catch(e) {}
            
            user = tg.initDataUnsafe?.user;
            
            // Telegram param takes precedence over URL param
            if (tg.initDataUnsafe?.start_param) {
                startParam = tg.initDataUnsafe.start_param;
            }
         }

         // 3. Force Save Data Immediately
         if (user) {
            const telegramId = user.id;
            const username = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || `user_${telegramId}`;
            
            // Prepare Data Object
            const userDataToSave: UserData = {
                id: String(telegramId),
                username: username,
                telegramId: telegramId,
                firstName: user.first_name,
                lastName: user.last_name,
                languageCode: user.language_code,
                isPremium: user.is_premium,
                allowsWriteToPm: user.allows_write_to_pm,
                isBot: user.is_bot,
                addedToAttachmentMenu: user.added_to_attachment_menu,
                photoUrl: user.photo_url,
                platform: "ETHERCHESS Web/TMA",
                isOnline: true
            };

            // Handle Referrer / Invite
            if (startParam) {
                if (startParam.startsWith('invite_')) {
                    // It's an invite link (challenge)
                    setPendingInviteId(startParam.replace('invite_', ''));
                } else {
                    // It's a referral code - SAVE IMMEDIATELY
                    userDataToSave.referredBy = startParam;
                }
            }

            // EXECUTE SAVE
            await saveUser(userDataToSave);

            // Update Local State & Storage
            setCurrentUser(username);
            localStorage.setItem('telegram_username', username);
            localStorage.setItem('telegram_id', String(telegramId));
            if (user.photo_url) localStorage.setItem('telegram_photo', user.photo_url);
         }
     };

     initApp();
  }, []);

  // Handle Deep Link Invite (Separate effect as it depends on currentUser being set)
  useEffect(() => {
      if (currentUser && pendingInviteId) {
          handleDeepLinkInvite(pendingInviteId, currentUser);
          setPendingInviteId(null);
      }
  }, [currentUser, pendingInviteId]);

  // Fallback Login Handler (for widget or manual login if needed)
  const handleLogin = (user: any) => {
      const telegramId = user.id;
      const username = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || `user_${telegramId}`;
      setCurrentUser(username);
      
      localStorage.setItem('telegram_username', username);
      localStorage.setItem('telegram_id', String(telegramId));
      if (user.photo_url) localStorage.setItem('telegram_photo', user.photo_url);

      saveUser({
          id: String(telegramId),
          username: username,
          telegramId: telegramId,
          firstName: user.first_name,
          lastName: user.last_name,
          photoUrl: user.photo_url,
          platform: "ETHERCHESS Web",
          isOnline: true
      });
  };

  const handleDeepLinkInvite = async (challengeId: string, myUsername: string) => {
      const challenge = await getChallenge(challengeId) as Challenge | null;
      if (challenge && challenge.status === 'pending') {
          if (challenge.from !== myUsername) {
              setIncomingChallenge(challenge as Challenge);
          }
      }
  };

  useEffect(() => {
      if (!currentUser) return;
      
      // Retrieve ID for key consistency
      let userId: string = currentUser;
      const storedId = localStorage.getItem('telegram_id');
      if (storedId) userId = storedId;

      // Initialize Realtime Presence
      const disconnectPresence = setupPresence(userId); // Pass ID preferably
      
      // Fallback heartbeat (optional but good for lastActive accuracy while online)
      updateUserPresence(userId); 
      const interval = setInterval(() => updateUserPresence(userId), 60000);
      
      return () => {
          clearInterval(interval);
          if (disconnectPresence) disconnectPresence();
      };
  }, [currentUser]);

  useEffect(() => {
      if (tonWallet) {
          const rawAddress = tonWallet.account.address;
          setWallet({
              connected: true,
              address: rawAddress.slice(0, 6) + '...' + rawAddress.slice(-4),
              balance: 0 
          });
          if (currentUser) {
              const storedId = localStorage.getItem('telegram_id');
              saveUser({ 
                  username: currentUser, 
                  walletAddress: rawAddress,
                  ...(storedId ? { telegramId: Number(storedId) } : {})
              });
          }
          setIsWalletModalOpen(false);
          addNotification({ type: 'success', title: 'Wallet Connected', message: 'Your TON wallet is now active.' });
      } else {
          setWallet({ connected: false, address: null, balance: 0 });
      }
  }, [tonWallet, currentUser]);

  useEffect(() => {
      if (!currentUser) return;
      const unsubscribe = subscribeToChallenges(currentUser, (challenges) => {
          if (challenges.length > 0) {
              const topChallenge = challenges[0] as Challenge;
              setIncomingChallenge(prev => {
                  // Only play sound if it's a new challenge we haven't seen yet in this session
                  if (prev?.id !== topChallenge.id) {
                      const isInGame = !!onlineGameId;
                      
                      if (!isInGame) {
                          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                          audio.volume = 0.5;
                          audio.play().catch((e) => console.log("Audio play failed (interaction needed):", e));
                          
                          // Haptic Feedback for Challenge
                          if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                              (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                          } else if (navigator.vibrate) {
                              navigator.vibrate([100, 50, 100]);
                          }
                      }
                      
                      // Show Interactive Notification as well
                      if (topChallenge.type !== 'invite_link' && !isInGame) {
                          addNotification({
                              type: 'challenge',
                              title: 'New Challenge',
                              message: `${topChallenge.from} wants to play!`,
                              duration: 10000,
                              actions: [
                                  { label: 'Accept', onClick: () => handleAcceptChallengeNotification(topChallenge), variant: 'primary' },
                                  { label: 'Decline', onClick: () => handleDeclineChallengeNotification(topChallenge), variant: 'secondary' }
                              ]
                          });
                      }
                  }
                  
                  // Do not show the challenge modal if the user is currently in a game
                  if (onlineGameId) {
                      return prev;
                  }
                  
                  return topChallenge;
              });
          } else {
              setIncomingChallenge(prev => prev?.type === 'invite_link' ? prev : null);
          }
      });
      return () => unsubscribe();
  }, [currentUser, onlineGameId]);

  useEffect(() => {
      if (!currentUser) return;
      const unsubscribe = subscribeToActiveUserGame(currentUser, (gameId) => {
          if (gameId && gameId !== onlineGameId) {
              setOnlineGameId(gameId);
              setActiveTab(AppTab.PLAY);
              setIncomingChallenge(null); 
              addNotification({ type: 'success', message: 'Game Started! Good luck.', duration: 3000 });
          }
      });
      return () => unsubscribe();
  }, [currentUser, onlineGameId]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const handleConnectWallet = () => tonConnectUI.openModal();
  const handleDisconnect = () => {
      tonConnectUI.disconnect();
      addNotification({ type: 'info', message: 'Wallet disconnected' });
  };
  const handleReviewGame = (pgn: string) => { setGameToLoad({ pgn }); setOnlineGameId(null); setActiveTab(AppTab.PLAY); };
  
  const handleSpectateGame = (gameId: string) => {
      setOnlineGameId(gameId);
      setActiveTab(AppTab.PLAY);
      addNotification({ type: 'info', message: 'Spectating match...' });
  };

  // Wrapper to handle challenges from notification buttons (avoids closure staleness if used directly in effects)
  const handleAcceptChallengeNotification = async (challenge: Challenge) => {
      if (!challenge) return;
      ACCEPT_SOUND.play().catch(() => {});
      await respondToChallenge(challenge.id, 'accepted', challenge);
      setIncomingChallenge(null);
  };

  const handleDeclineChallengeNotification = async (challenge: Challenge) => {
      if (!challenge) return;
      await respondToChallenge(challenge.id, 'rejected');
      setIncomingChallenge(null);
      addNotification({ type: 'info', message: 'Challenge declined.' });
  };

  const handleAcceptChallenge = async () => {
      if (!incomingChallenge) return;
      
      ACCEPT_SOUND.play().catch(() => {});
      
      let gameId = null;
      if (incomingChallenge.type === 'invite_link') {
          gameId = await acceptInvite(incomingChallenge.id, incomingChallenge.from, currentUser);
      } else {
          gameId = await respondToChallenge(incomingChallenge.id, 'accepted', incomingChallenge);
      }

      if (gameId) {
          setOnlineGameId(gameId);
          setActiveTab(AppTab.PLAY);
          setIncomingChallenge(null);
      }
  };

  const handleDeclineChallenge = async () => {
      if (!incomingChallenge) return;
      if (incomingChallenge.type !== 'invite_link') {
          await respondToChallenge(incomingChallenge.id, 'rejected');
      }
      setIncomingChallenge(null);
  };

  const handleOpenNotifications = () => {
      setIsNotificationModalOpen(true);
      markAllRead();
  };

  // Helper to get notification icon for history
  const getNotificationIcon = (type: string) => {
      switch (type) {
          case 'success': return <CheckCircle2 className="text-green-500" size={18} />;
          case 'warning': return <AlertTriangle className="text-yellow-500" size={18} />;
          case 'error': return <AlertCircle className="text-destructive" size={18} />;
          case 'challenge': return <Swords className="text-primary" size={18} />;
          default: return <Info className="text-blue-500" size={18} />;
      }
  };

  // If no user is logged in, show the Login Screen
  if (!currentUser) {
      return (
          <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
              <LiquidCard className="w-full max-w-md p-8 flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
                      <Crown size={40} strokeWidth={2} />
                  </div>
                  <h1 className="text-3xl font-black mb-2 tracking-tight">ETHERCHESS AI</h1>
                  <p className="text-muted-foreground mb-8">
                      Next-gen chess platform on TON.<br/>
                      Connect with Telegram to start.
                  </p>
                  
                  <div className="w-full bg-muted/30 rounded-xl p-6 border border-border">
                      <TelegramLoginWidget onAuth={handleLogin} />
                  </div>
                  
                  <p className="mt-8 text-xs text-muted-foreground opacity-50">
                      By continuing, you accept our Terms of Service.
                  </p>
              </LiquidCard>
          </div>
      );
  }

  return (
      <div className={`min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300`}>
        
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14">
              <div className="flex items-center gap-2">
                 <div className="w-8 h-8 bg-foreground text-background rounded-md flex items-center justify-center">
                    <Crown size={18} strokeWidth={2.5} />
                 </div>
                 <span className="font-bold tracking-tight text-lg uppercase hidden sm:block">EtherChess</span>
              </div>

              <nav className="hidden md:flex gap-1 items-center">
                <NavButton active={activeTab === AppTab.PLAY} onClick={() => setActiveTab(AppTab.PLAY)} icon={<Gamepad2 size={16} />} label="Play" />
                <NavButton active={activeTab === AppTab.TRAINING} onClick={() => setActiveTab(AppTab.TRAINING)} icon={<Target size={16} />} label="Training" />
                <NavButton active={activeTab === AppTab.WALLET || activeTab === AppTab.LEADERBOARD} onClick={() => setActiveTab(AppTab.LEADERBOARD)} icon={<Trophy size={16} />} label="Ranking" />
                <div className="h-4 w-px bg-border mx-2"></div>
                <button
                  onClick={() => setIsWalletModalOpen(true)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${wallet.connected ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                >
                  <Wallet size={14} />
                  {wallet.connected ? wallet.address : 'Connect'}
                </button>
              </nav>

              <div className="flex items-center gap-2">
                 {/* Notification Button */}
                 <button onClick={handleOpenNotifications} className="relative p-2 rounded-md hover:bg-accent text-foreground transition-colors">
                    <Bell size={20} />
                    {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-background"></span>
                    )}
                 </button>

                 {/* Admin Button */}
                 <button onClick={() => setIsAdminPanelOpen(true)} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Admin">
                    <Shield size={20} />
                 </button>

                 <div className="md:hidden flex gap-2">
                     <button onClick={() => setIsWalletModalOpen(true)} className="p-2 rounded-md hover:bg-accent text-foreground">
                        <Wallet size={20} />
                      </button>
                      <button onClick={toggleTheme} className="p-2 rounded-md hover:bg-accent text-foreground">
                        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                      </button>
                 </div>

                 <button onClick={toggleTheme} className="hidden md:block p-2 rounded-md hover:bg-accent transition-colors ml-2 text-foreground">
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
              </div>
            </div>
          </div>
        </header>

        <LiquidModal isOpen={!!incomingChallenge} onClose={handleDeclineChallenge} title="New Challenge">
             <div className="flex flex-col items-center py-4">
                 <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mb-4 animate-bounce">
                     <Swords size={24} />
                 </div>
                 <h3 className="text-lg font-bold text-center">
                    {incomingChallenge?.type === 'invite_link' ? 'Shared Invite' : 'Direct Challenge'}
                 </h3>
                 <p className="text-muted-foreground text-sm mb-6 text-center">
                    <strong className="text-foreground">@{incomingChallenge?.from}</strong> wants to play a match.
                 </p>
                 <div className="grid grid-cols-2 gap-4 w-full">
                     <LiquidButton variant="secondary" onClick={handleDeclineChallenge} className="justify-center">Decline</LiquidButton>
                     <LiquidButton variant="primary" onClick={handleAcceptChallenge} className="justify-center">Accept Game</LiquidButton>
                 </div>
             </div>
        </LiquidModal>

        <LiquidModal isOpen={isNotificationModalOpen} onClose={() => setIsNotificationModalOpen(false)} title="Notifications">
            <div className="flex justify-between items-center mb-4 px-1">
               <span className="text-xs font-bold uppercase text-muted-foreground">{history.length} Recent</span>
               {history.length > 0 && (
                   <button onClick={clearHistory} className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors">
                       <Trash2 size={12}/> Clear all
                   </button>
               )}
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
               {history.length === 0 ? (
                   <div className="flex flex-col items-center justify-center py-10 text-muted-foreground opacity-50">
                       <Bell size={32} className="mb-2"/>
                       <p className="text-xs">No notifications yet.</p>
                   </div>
               ) : (
                   history.map(n => (
                       <div key={n.id} className="p-3 rounded-lg border border-border bg-muted/20 flex gap-3 hover:bg-muted/40 transition-colors">
                           <div className="mt-0.5 shrink-0">{getNotificationIcon(n.type)}</div>
                           <div className="flex-grow min-w-0">
                               <div className="flex justify-between items-start">
                                   <h4 className="text-sm font-bold truncate pr-2">{n.title || "Notification"}</h4>
                                   <span className="text-[10px] text-muted-foreground shrink-0">{n.timestamp ? new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                               </div>
                               <p className="text-xs text-muted-foreground leading-relaxed break-words">{n.message}</p>
                           </div>
                       </div>
                   ))
               )}
            </div>
            <div className="mt-4 pt-2 border-t border-border">
                <LiquidButton onClick={() => setIsNotificationModalOpen(false)} variant="secondary" className="w-full">Close</LiquidButton>
            </div>
        </LiquidModal>

        <LiquidModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} title="Wallet Settings">
           {!wallet.connected ? (
             <div className="flex flex-col items-center py-6">
                <div className="w-16 h-16 bg-primary text-primary-foreground rounded-xl flex items-center justify-center mb-6">
                    <Wallet className="w-8 h-8" />
                </div>
                <h4 className="text-xl font-bold mb-2">Connect TON</h4>
                <p className="text-muted-foreground text-center text-sm mb-8 px-4">Connect your TON wallet to participate in ranked matches and withdraw earnings.</p>
                <LiquidButton onClick={handleConnectWallet} className="w-full justify-center">Connect TON Wallet</LiquidButton>
             </div>
           ) : (
             <div className="py-2">
                <div className="bg-green-500/10 border border-green-500/20 rounded-md p-4 flex items-center gap-4 mb-6">
                    <CheckCircle2 size={24} className="text-green-600" />
                    <div>
                       <p className="text-xs font-bold text-green-600 uppercase">Wallet Connection</p>
                       <p className="font-bold text-sm">Active & Verified</p>
                    </div>
                </div>
                <div className="space-y-4 mb-8">
                   <div className="p-3 bg-muted rounded-md border border-border">
                      <p className="text-xs text-muted-foreground mb-1">Public Address</p>
                      <div className="flex justify-between items-center">
                         <code className="font-mono font-medium text-sm truncate">{wallet.address}</code>
                         <button className="text-muted-foreground hover:text-foreground" onClick={() => navigator.clipboard.writeText(tonWallet?.account.address || '')}><Copy size={14}/></button>
                      </div>
                   </div>
                   <div className="p-3 bg-muted rounded-md border border-border">
                      <p className="text-xs text-muted-foreground mb-1">Balance</p>
                      <p className="font-mono font-bold text-lg">{wallet.balance.toFixed(2)} TON</p>
                   </div>
                </div>
                <LiquidButton onClick={handleDisconnect} variant="danger" className="w-full justify-center"><LogOut size={16} className="mr-2"/> Disconnect Wallet</LiquidButton>
             </div>
           )}
        </LiquidModal>

        {isAdminPanelOpen && <AdminPanel onClose={() => setIsAdminPanelOpen(false)} />}

        <main className="flex-grow pt-6 px-2 pb-20 md:pb-6">
          <div style={{ display: activeTab === AppTab.PLAY ? 'block' : 'none' }} className="h-full">
            <ChessGame 
                theme={theme} 
                gameToLoad={gameToLoad} 
                currentUser={currentUser} 
                onUsernameSubmit={() => {}} 
                onlineGameId={onlineGameId} 
                onSpectate={handleSpectateGame}
            />
          </div>
          <div style={{ display: activeTab === AppTab.TRAINING ? 'block' : 'none' }} className="h-full">
            <TrainingHub />
          </div>
          <div style={{ display: (activeTab === AppTab.WALLET || activeTab === AppTab.LEADERBOARD) ? 'block' : 'none' }} className="h-full">
            <WalletLeaderboard 
                wallet={wallet} 
                onConnectRequest={() => setIsWalletModalOpen(true)} 
                isActive={activeTab === AppTab.LEADERBOARD || activeTab === AppTab.WALLET} 
                onReviewGame={handleReviewGame}
                onSpectateGame={handleSpectateGame}
            />
          </div>
        </main>

        <div className="md:hidden fixed bottom-0 left-0 w-full z-50 bg-background border-t border-border pb-safe">
          <div className="flex justify-around items-center h-14 px-4">
             <MobileNavLink active={activeTab === AppTab.PLAY} onClick={() => setActiveTab(AppTab.PLAY)} icon={<Gamepad2 size={20} />} label="Play" />
             <MobileNavLink active={activeTab === AppTab.TRAINING} onClick={() => setActiveTab(AppTab.TRAINING)} icon={<Target size={20} />} label="Train" />
             <MobileNavLink active={activeTab === AppTab.WALLET || activeTab === AppTab.LEADERBOARD} onClick={() => setActiveTab(AppTab.LEADERBOARD)} icon={<Trophy size={20} />} label="Rank" />
          </div>
        </div>

      </div>
  );
}

// Wrapper for Notification Provider
export default function App() {
  return (
    <NotificationProvider>
      <HashRouter>
        <AppContent />
      </HashRouter>
    </NotificationProvider>
  );
}

const NavButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
    {icon} {label}
  </button>
);

const MobileNavLink = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-full h-full gap-1 ${active ? 'text-primary' : 'text-muted-foreground'}`}>
    {icon} <span className="text-[10px] font-medium">{label}</span>
  </button>
);
