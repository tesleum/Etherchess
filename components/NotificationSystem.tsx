
import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, CheckCircle2, AlertTriangle, AlertCircle, Swords, Bell } from 'lucide-react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'challenge';

export interface NotificationAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface Notification {
  id: string;
  type: NotificationType;
  title?: string;
  message: string;
  duration?: number; // 0 for persistent
  actions?: NotificationAction[];
  icon?: React.ReactNode;
  timestamp?: number;
}

interface NotificationContextType {
  addNotification: (notification: Omit<Notification, 'id'>) => string;
  removeNotification: (id: string) => void;
  history: Notification[];
  unreadCount: number;
  clearHistory: () => void;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [history, setHistory] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newNotification = { ...notification, id, timestamp: Date.now() };
    
    setNotifications((prev) => [...prev, newNotification]);
    setHistory((prev) => [newNotification, ...prev].slice(0, 50)); // Keep last 50
    setUnreadCount(prev => prev + 1);

    if (notification.duration !== 0) {
      const duration = notification.duration || 5000;
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
    
    return id;
  }, [removeNotification]);

  const clearHistory = useCallback(() => {
      setHistory([]);
      setUnreadCount(0);
  }, []);

  const markAllRead = useCallback(() => {
      setUnreadCount(0);
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification, removeNotification, history, unreadCount, clearHistory, markAllRead }}>
      {children}
      {/* Notification Stack: Top Center on Mobile, Top Right on Desktop */}
      <div className="fixed top-14 left-0 right-0 md:left-auto md:right-4 z-[200] flex flex-col items-center md:items-end gap-2 w-full md:max-w-sm pointer-events-none p-4">
        <AnimatePresence mode='popLayout'>
          {notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onClose={() => removeNotification(n.id)} />
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};

const NotificationItem = ({ notification, onClose }: { notification: Notification; onClose: () => void }) => {
  const getIcon = () => {
    if (notification.icon) return notification.icon;
    switch (notification.type) {
      case 'success': return <CheckCircle2 className="text-green-500" size={20} />;
      case 'warning': return <AlertTriangle className="text-yellow-500" size={20} />;
      case 'error': return <AlertCircle className="text-destructive" size={20} />;
      case 'challenge': return <Swords className="text-primary" size={20} />;
      default: return <Info className="text-blue-500" size={20} />;
    }
  };

  const borderColor = () => {
      switch (notification.type) {
          case 'success': return 'border-green-500/50';
          case 'error': return 'border-destructive/50';
          case 'challenge': return 'border-primary/50';
          default: return 'border-border';
      }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className={`
        pointer-events-auto w-full max-w-[350px]
        bg-background/95 backdrop-blur-md text-foreground 
        border ${borderColor()} shadow-lg rounded-xl overflow-hidden
      `}
    >
      <div className="p-4 flex gap-3">
        <div className="shrink-0 mt-0.5">{getIcon()}</div>
        <div className="flex-grow min-w-0">
          {notification.title && <h4 className="font-bold text-sm mb-0.5">{notification.title}</h4>}
          <p className="text-xs text-muted-foreground leading-relaxed font-medium">{notification.message}</p>
          
          {notification.actions && notification.actions.length > 0 && (
            <div className="flex gap-2 mt-3">
              {notification.actions.map((action, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick();
                  }}
                  className={`
                    px-3 py-1.5 rounded-md text-xs font-bold transition-colors
                    ${action.variant === 'primary' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 
                      action.variant === 'danger' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' :
                      'bg-secondary text-secondary-foreground hover:bg-secondary/80'}
                  `}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground self-start p-1 hover:bg-muted rounded-full transition-colors">
          <X size={14} />
        </button>
      </div>
      {/* Progress bar could go here */}
      <div className={`h-0.5 w-full ${
          notification.type === 'success' ? 'bg-green-500/20' : 
          notification.type === 'error' ? 'bg-destructive/20' : 
          'bg-primary/20'
      }`}>
          {notification.duration !== 0 && (
              <motion.div 
                initial={{ width: "100%" }} 
                animate={{ width: "0%" }} 
                transition={{ duration: (notification.duration || 5000) / 1000, ease: "linear" }}
                className={`h-full ${
                    notification.type === 'success' ? 'bg-green-500' : 
                    notification.type === 'error' ? 'bg-destructive' : 
                    'bg-primary'
                }`}
              />
          )}
      </div>
    </motion.div>
  );
};
