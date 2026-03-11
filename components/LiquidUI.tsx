
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// Re-using component names to avoid refactoring entire app, but styling is Minimal/Shadcn

interface LiquidCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  style?: React.CSSProperties;
}

export const LiquidCard: React.FC<LiquidCardProps> = ({ children, className = '', delay = 0, style }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className={`
        bg-card text-card-foreground
        border border-border
        shadow-sm rounded-lg
        ${className}
      `}
      style={style}
    >
      {children}
    </motion.div>
  );
};

interface LiquidButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

export const LiquidButton: React.FC<LiquidButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  isLoading,
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2";
  
  const variants = {
    primary: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 border border-input",
    danger: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};

export const LiquidBadge: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = "bg-primary" }) => (
  <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80`}>
    {children}
  </span>
);

export const LoadingSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-md bg-muted ${className}`} />
);

interface LiquidModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const LiquidModal: React.FC<LiquidModalProps> = ({ isOpen, onClose, title, children }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.98, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 10 }}
            className="relative w-full max-w-lg bg-card text-card-foreground border border-border rounded-lg shadow-lg z-10"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 pb-2">
              <h3 className="font-semibold text-lg tracking-tight">{title}</h3>
              <button 
                onClick={onClose}
                className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 pt-2">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

interface LiquidSwitchProps {
  options: { value: string; label: string; icon?: React.ReactNode }[];
  activeValue: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export const LiquidSwitch: React.FC<LiquidSwitchProps> = ({ options, activeValue, onChange, disabled, className = '' }) => {
  return (
    <div className={`inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground ${className}`}>
      {options.map((option) => {
        const isActive = activeValue === option.value;
        return (
          <button
            key={option.value}
            onClick={() => !disabled && onChange(option.value)}
            disabled={disabled}
            className={`
              inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50
              ${isActive ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/50 hover:text-foreground'}
            `}
          >
            <span className="flex items-center gap-2">
              {option.icon}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const Typewriter: React.FC<{ text: string; timestamp?: number; speed?: number }> = ({ text, timestamp, speed = 15 }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    // If message is older than 5 seconds (likely initial history load), show instantly
    if (timestamp && Date.now() - timestamp > 5000) {
      setDisplayedText(text);
      return;
    }

    // Optimization for long text: speed up
    const effectiveSpeed = text.length > 50 ? speed / 2 : speed;

    let i = 0;
    setStarted(true);
    const timer = setInterval(() => {
      setDisplayedText(text.slice(0, i + 1));
      i++;
      if (i > text.length) clearInterval(timer);
    }, effectiveSpeed);

    return () => clearInterval(timer);
  }, [text, timestamp, speed]);

  return <span>{displayedText}{started && displayedText.length < text.length && <span className="animate-pulse">|</span>}</span>;
};
