import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { NotificationProvider } from './context/NotificationContext';
import { Navbar } from './components/layout/Navbar';
import { ToastContainer } from './components/layout/ToastContainer';
import { AuthModal } from './components/auth/AuthModal';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';
import { BookingWizard } from './components/booking/BookingWizard';
import { CustomerDashboard } from './components/customer/CustomerDashboard';
import { StaffDashboard } from './components/staff/StaffDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';

const MainContent: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>(() => {
    const saved = sessionStorage.getItem('activeTab');
    if (saved) return saved;
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u.role === 'ADMIN') return 'admin';
        if (u.role === 'STAFF') return 'staff';
      } catch {}
    }
    return 'book';
  });
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  const handleSetActiveTab = (tab: string) => {
    setActiveTab(tab);
    sessionStorage.setItem('activeTab', tab);
  };

  // Auto-switch tab if user role changes or initial login occurs
  React.useEffect(() => {
    const savedTab = sessionStorage.getItem('activeTab');
    if (!savedTab) {
      if (user?.role === 'STAFF') {
        setActiveTab('staff');
      } else if (user?.role === 'ADMIN') {
        setActiveTab('admin');
      }
    } else if (user?.role === 'CUSTOMER' && (savedTab === 'admin' || savedTab === 'staff')) {
      setActiveTab('dashboard');
      sessionStorage.setItem('activeTab', 'dashboard');
    }
  }, [user?.role]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      <main style={{ flex: 1, padding: '1.5rem 1rem' }}>
        {activeTab === 'book' && (
          <BookingWizard
            onSuccessNavigate={() => setActiveTab('dashboard')}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {activeTab === 'dashboard' && <CustomerDashboard />}

        {activeTab === 'staff' && <StaffDashboard />}

        {activeTab === 'admin' && <AdminDashboard />}
      </main>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      <NotificationDrawer />
      <ToastContainer />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <NotificationProvider>
          <MainContent />
        </NotificationProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
