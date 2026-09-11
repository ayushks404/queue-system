import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useNotifications } from '../../context/NotificationContext';
import {
  Calendar,
  Layers,
  Bell,
  LogOut,
  User as UserIcon,
  Shield,
  Activity,
  Users,
  Clock,
  Sparkles,
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onOpenAuth }) => {
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();
  const { unreadCount, setIsDrawerOpen, isDrawerOpen } = useNotifications();

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      backgroundColor: 'rgba(9, 13, 22, 0.85)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        {/* Brand */}
        <div
          onClick={() => setActiveTab(user?.role === 'STAFF' ? 'staff' : user?.role === 'ADMIN' ? 'admin' : 'book')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--glow-indigo)',
          }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>SmartQueue</span>
              <span style={{ fontSize: '0.65rem', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>PRO</span>
            </div>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {(!user || user.role === 'CUSTOMER') && (
            <>
              <button
                className={`btn btn-sm ${activeTab === 'book' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('book')}
              >
                <Calendar size={15} /> Book Slot
              </button>
              {user && (
                <button
                  className={`btn btn-sm ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('dashboard')}
                >
                  <Clock size={15} /> My Appointments
                </button>
              )}
            </>
          )}

          {user && (user.role === 'STAFF' || user.role === 'ADMIN') && (
            <>
              <button
                className={`btn btn-sm ${activeTab === 'staff' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('staff')}
              >
                <Users size={15} /> Staff Queue
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'book' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('book')}
              >
                <Calendar size={15} /> Booking
              </button>
            </>
          )}

          {user?.role === 'ADMIN' && (
            <button
              className={`btn btn-sm ${activeTab === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('admin')}
            >
              <Layers size={15} /> Catalog Admin
            </button>
          )}
        </nav>

        {/* Right Action Icons & User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Real-time connection badge */}
          <div
            title={isConnected ? 'Live WebSocket Connected' : 'Connecting to real-time service...'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.3rem 0.6rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 500,
              background: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
              color: isConnected ? '#34d399' : '#fb7185',
              border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
            }}
          >
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#10b981' : '#f43f5e',
              display: 'inline-block',
              animation: isConnected ? 'pulse-glow 2s infinite' : 'none',
            }} />
            <span style={{ display: 'none', minWidth: '40px' }} className="sm-show">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>

          {/* Notifications Bell */}
          {user && (
            <button
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className="btn btn-secondary btn-sm"
              style={{ position: 'relative', padding: '0.5rem' }}
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  background: 'var(--accent-rose)',
                  color: '#fff',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid var(--bg-primary)',
                  animation: 'pulse-glow 1.5s infinite',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* User / Login */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
              }}>
                {user.role === 'ADMIN' ? (
                  <Shield size={16} color="#818cf8" />
                ) : user.role === 'STAFF' ? (
                  <Activity size={16} color="#22d3ee" />
                ) : (
                  <UserIcon size={16} color="#94a3b8" />
                )}
                <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{user.name || user.email.split('@')[0]}</div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)', textTransform: 'uppercase' }}>
                    {user.role}
                  </span>
                </div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={logout}
                title="Sign out"
                style={{ padding: '0.5rem' }}
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onOpenAuth}>
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
