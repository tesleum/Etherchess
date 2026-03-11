
import React, { useEffect } from 'react';
import { TELEGRAM_BOT_ID } from '../config';
import { LiquidButton } from './LiquidUI';
import { Send } from 'lucide-react';

interface TelegramLoginWidgetProps {
  onAuth: (user: any) => void;
}

export const TelegramLoginWidget: React.FC<TelegramLoginWidgetProps> = ({ onAuth }) => {

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin
      if (event.origin !== "https://oauth.telegram.org") return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.event === 'auth_user' && data.auth_user) {
           onAuth(data.auth_user);
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuth]);

  const handleLogin = () => {
    const botId = TELEGRAM_BOT_ID;
    const origin = window.location.origin;
    // Using embed=1 ensures it communicates via postMessage like the widget
    const url = `https://oauth.telegram.org/auth?bot_id=${botId}&origin=${encodeURIComponent(origin)}&request_access=write&embed=1`;
    
    window.open(url, 'telegram_login', 'width=550,height=470,left=100,top=100');
  };

  return (
    <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
        <LiquidButton 
            onClick={handleLogin} 
            className="!bg-[#24A1DE] hover:!bg-[#24A1DE]/90 !text-white w-full max-w-xs flex items-center justify-center gap-2 font-bold"
        >
            <Send size={18} />
            Log in with Telegram
        </LiquidButton>
        <p className="text-[10px] text-muted-foreground">Secure login via Telegram</p>
    </div>
  );
};
