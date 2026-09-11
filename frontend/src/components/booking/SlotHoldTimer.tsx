import React, { useState, useEffect } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';

interface SlotHoldTimerProps {
  expiresAt: string;
  onExpired: () => void;
}

export const SlotHoldTimer: React.FC<SlotHoldTimerProps> = ({ expiresAt, onExpired }) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    return diff;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsRemaining(diff);

      if (diff <= 0) {
        clearInterval(interval);
        onExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const isUrgent = secondsRemaining < 60;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.85rem 1.25rem',
        borderRadius: 'var(--radius-md)',
        background: isUrgent ? 'rgba(244, 63, 94, 0.15)' : 'rgba(99, 102, 241, 0.12)',
        border: `1px solid ${isUrgent ? 'rgba(244, 63, 94, 0.4)' : 'rgba(99, 102, 241, 0.3)'}`,
        color: isUrgent ? '#fb7185' : '#a5b4fc',
        animation: isUrgent ? 'pulse-glow 1.5s infinite' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {isUrgent ? <AlertTriangle size={18} /> : <Timer size={18} />}
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            {isUrgent ? 'Slot Hold Expiring Soon!' : 'Temporary Slot Reservation Held'}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
            Complete your confirmation before the hold expires
          </div>
        </div>
      </div>

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '1.25rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        padding: '0.2rem 0.6rem',
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(0, 0, 0, 0.25)',
      }}>
        {formattedTime}
      </div>
    </div>
  );
};
