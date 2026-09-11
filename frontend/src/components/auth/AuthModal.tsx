import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { X, Lock, Mail, User, Phone, Sparkles } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, defaultMode = 'login' }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'CUSTOMER' | 'STAFF' | 'ADMIN'>('CUSTOMER');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, password, name, phone, role });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoRole: 'ADMIN' | 'STAFF' | 'CUSTOMER') => {
    setError(null);
    setLoading(true);
    try {
      if (demoRole === 'ADMIN') {
        await login('admin@queue.local', 'AdminPassword123!');
      } else if (demoRole === 'STAFF') {
        // Try logging in or auto register staff
        try {
          await login('staff@queue.local', 'StaffPassword123!');
        } catch {
          await register({
            email: 'staff@queue.local',
            password: 'StaffPassword123!',
            name: 'Staff Member',
            role: 'STAFF',
          });
        }
      } else {
        try {
          await login('customer@queue.local', 'CustomerPassword123!');
        } catch {
          await register({
            email: 'customer@queue.local',
            password: 'CustomerPassword123!',
            name: 'John Doe',
            phone: '+15550192',
            role: 'CUSTOMER',
          });
        }
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <X size={20} />
        </button>

        {/* Tab Header */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: mode === 'login' ? 'var(--text-main)' : 'var(--text-faint)',
              fontSize: '1.1rem',
              fontWeight: mode === 'login' ? 700 : 500,
              cursor: 'pointer',
              position: 'relative',
              paddingBottom: '0.5rem',
            }}
          >
            Sign In
            {mode === 'login' && (
              <div style={{ position: 'absolute', bottom: '-0.55rem', left: 0, right: 0, height: '2px', background: 'var(--accent-primary)' }} />
            )}
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: mode === 'register' ? 'var(--text-main)' : 'var(--text-faint)',
              fontSize: '1.1rem',
              fontWeight: mode === 'register' ? 700 : 500,
              cursor: 'pointer',
              position: 'relative',
              paddingBottom: '0.5rem',
            }}
          >
            Create Account
            {mode === 'register' && (
              <div style={{ position: 'absolute', bottom: '-0.55rem', left: 0, right: 0, height: '2px', background: 'var(--accent-primary)' }} />
            )}
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            color: '#fb7185',
            fontSize: '0.85rem',
            marginBottom: '1.25rem',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={16} color="var(--text-faint)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ paddingLeft: '38px' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number (Optional)</label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} color="var(--text-faint)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="+1 555-0199"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{ paddingLeft: '38px' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Account Role</label>
                <select
                  className="form-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                >
                  <option value="CUSTOMER">Customer (Book & track appointments)</option>
                  <option value="STAFF">Staff (Manage queue & call tickets)</option>
                  <option value="ADMIN">Admin (Manage branches, services, resources)</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="var(--text-faint)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
              <input
                type="email"
                required
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-faint)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem' }}
          >
            {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Quick Demo Logins */}
        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Sparkles size={13} color="#818cf8" /> One-Click Demo Logins
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickDemoLogin('ADMIN')}
              disabled={loading}
              style={{ fontSize: '0.75rem' }}
            >
              Admin Seed
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickDemoLogin('STAFF')}
              disabled={loading}
              style={{ fontSize: '0.75rem' }}
            >
              Staff Demo
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickDemoLogin('CUSTOMER')}
              disabled={loading}
              style={{ fontSize: '0.75rem' }}
            >
              Customer Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
