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
    return 'book';
  });
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  // Auto-switch tab if user role changes
  React.useEffect(() => {
    if (user?.role === 'STAFF' && activeTab === 'dashboard') {
      setActiveTab('staff');
    } else if (user?.role === 'ADMIN' && activeTab === 'dashboard') {
      setActiveTab('admin');
    }
  }, [user?.role]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
