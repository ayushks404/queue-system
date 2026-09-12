import React from 'react';
import { useNotifications } from '../../context/NotificationContext';
import {
  X,
  Bell,
  Check,
  CheckCheck,
  Calendar,
  Volume2,
  Sparkles,
} from 'lucide-react';

export const NotificationDrawer: React.FC = () => {
  const {
    notifications,
    unreadCount,
    isDrawerOpen,
    setIsDrawerOpen,
    markAsRead,
    markAllAsRead,
    isLoading,
  } = useNotifications();

  if (!isDrawerOpen) return null;

  const getIconForType = (type: string) => {
    if (type.includes('APPOINTMENT') || type.includes('appointment')) {
      return <Calendar size={18} color="var(--accent-primary)" />;
    }
    if (type.includes('QUEUE') || type.includes('queue')) {
      return <Volume2 size={18} color="var(--accent-cyan)" />;
    }
    if (type.includes('WAITLIST') || type.includes('waitlist')) {
      return <Sparkles size={18} color="var(--accent-emerald)" />;
    }
    return <Bell size={18} color="var(--text-muted)" />;
  };

  return (
    <div className="modal-overlay" onClick={() => setIsDrawerOpen(false)} style={{ justifyContent: 'flex-end', padding: 0 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          height: '100vh',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-modal)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Drawer Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Bell size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.15rem' }}>Notifications</h3>
            {unreadCount > 0 && (
              <span className="badge badge-confirmed" style={{ fontSize: '0.7rem' }}>
                {unreadCount} New
              </span>
            )}
          </div>

          <button
            onClick={() => setIsDrawerOpen(false)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Action Bar */}
        {unreadCount > 0 && (
          <div style={{ padding: '0.6rem 1.5rem', background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={markAllAsRead}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            >
              <CheckCheck size={14} /> Mark all as read
            </button>
          </div>
        )}

        {/* Notifications List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {isLoading && notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-faint)' }}>
              <Bell size={36} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
              <p>No notifications right now.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    background: notif.is_read ? 'rgba(255, 255, 255, 0.02)' : 'rgba(99, 102, 241, 0.08)',
                    border: `1px solid ${notif.is_read ? 'var(--border-subtle)' : 'rgba(99, 102, 241, 0.3)'}`,
                    transition: 'all 0.2s',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ marginTop: '2px' }}>{getIconForType(notif.type)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: notif.is_read ? 500 : 700, color: 'var(--text-main)' }}>
                          {notif.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                          {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {notif.message}
                      </div>

                      {!notif.is_read && (
                        <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => markAsRead(notif.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                          >
                            <Check size={12} /> Mark read
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
