import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookingWizard } from './BookingWizard';
import { AuthProvider } from '../../context/AuthContext';
import { api } from '../../api/client';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockBranches = [
  { id: 'b1', name: 'MediQ City Hospital — Main Campus', address: '12 MG Road', phone: '+91 124 4567890', is_active: true },
];

const mockServices = [
  { id: 's1', name: 'General OPD Consultation', description: 'Primary consultation', duration_minutes: 15, price: 300, capacity: 1, is_active: true },
];

describe('BookingWizard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders available branches and advances to department selection', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/branches') return Promise.resolve({ branches: mockBranches });
      if (url === '/services') return Promise.resolve({ services: mockServices });
      return Promise.resolve({});
    });

    render(
      <AuthProvider>
        <BookingWizard />
      </AuthProvider>
    );

    expect(await screen.findByText('MediQ City Hospital — Main Campus')).toBeInTheDocument();

    fireEvent.click(screen.getByText('MediQ City Hospital — Main Campus'));

    expect(await screen.findByText('General OPD Consultation')).toBeInTheDocument();
  });

  it('fetches and renders available time slots when selecting a service and date', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/branches') return Promise.resolve({ branches: mockBranches });
      if (url === '/services') return Promise.resolve({ services: mockServices });
      if (url.startsWith('/availability')) {
        return Promise.resolve({ available_slots: ['09:00', '09:30', '10:00'] });
      }
      return Promise.resolve({});
    });

    render(
      <AuthProvider>
        <BookingWizard />
      </AuthProvider>
    );

    // Step 1: Select branch
    fireEvent.click(await screen.findByText('MediQ City Hospital — Main Campus'));

    // Step 2: Select service
    fireEvent.click(await screen.findByText('General OPD Consultation'));

    // Step 3: Slots rendered
    expect(await screen.findByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('09:30')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('renders empty slots state with waitlist option when no slots are available', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/branches') return Promise.resolve({ branches: mockBranches });
      if (url === '/services') return Promise.resolve({ services: mockServices });
      if (url.startsWith('/availability')) {
        return Promise.resolve({ available_slots: [] });
      }
      return Promise.resolve({});
    });

    render(
      <AuthProvider>
        <BookingWizard />
      </AuthProvider>
    );

    fireEvent.click(await screen.findByText('MediQ City Hospital — Main Campus'));
    fireEvent.click(await screen.findByText('General OPD Consultation'));

    expect(await screen.findByText('No Slots Available')).toBeInTheDocument();
    expect(screen.getByText('Join Waitlist for This Day')).toBeInTheDocument();
  });

  it('completes reservation hold and confirms appointment with appointment number', async () => {
    const mockUser = { id: 'u1', email: 'patient@queue.local', name: 'John Doe', role: 'CUSTOMER' };
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem('accessToken', 'mock_token');

    (api.get as any).mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ user: mockUser });
      if (url === '/branches') return Promise.resolve({ branches: mockBranches });
      if (url === '/services') return Promise.resolve({ services: mockServices });
      if (url.startsWith('/availability')) {
        return Promise.resolve({ available_slots: ['09:00'] });
      }
      return Promise.resolve({});
    });

    (api.post as any).mockImplementation((url: string) => {
      if (url === '/reservations') {
        return Promise.resolve({
          reservation: {
            id: 'res_123',
            branch_id: 'b1',
            service_id: 's1',
            slot_date: '2026-09-15',
            slot_time: '09:00',
            expires_at: new Date(Date.now() + 300000).toISOString(),
          },
        });
      }
      if (url === '/appointments') {
        return Promise.resolve({
          appointment: {
            id: 'apt_123',
            appointment_number: 'APT-2026-001245',
            appointment_date: '2026-09-15',
            start_time: '09:00',
            status: 'CONFIRMED',
          },
        });
      }
      return Promise.resolve({});
    });

    render(
      <AuthProvider>
        <BookingWizard />
      </AuthProvider>
    );

    // Step 1: Branch
    fireEvent.click(await screen.findByText('MediQ City Hospital — Main Campus'));

    // Step 2: Service
    fireEvent.click(await screen.findByText('General OPD Consultation'));

    // Step 3: Hold slot
    const slotButton = await screen.findByText('09:00');
    fireEvent.click(slotButton);

    // Step 4: Confirm Booking Screen
    expect(await screen.findByText('Confirm Appointment')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Confirm & Book Appointment' });
    fireEvent.click(confirmButton);

    // Step 5: Success Screen
    expect(await screen.findByText('Appointment Confirmed!')).toBeInTheDocument();
    expect(screen.getByText('APT-2026-001245')).toBeInTheDocument();
  });

  it('displays error when slot reservation fails with SLOT_UNAVAILABLE', async () => {
    const mockUser = { id: 'u1', email: 'patient@queue.local', name: 'John Doe', role: 'CUSTOMER' };
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem('accessToken', 'mock_token');

    (api.get as any).mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ user: mockUser });
      if (url === '/branches') return Promise.resolve({ branches: mockBranches });
      if (url === '/services') return Promise.resolve({ services: mockServices });
      if (url.startsWith('/availability')) {
        return Promise.resolve({ available_slots: ['09:00'] });
      }
      return Promise.resolve({});
    });

    (api.post as any).mockRejectedValueOnce(new Error('The selected appointment slot is no longer available.'));

    render(
      <AuthProvider>
        <BookingWizard />
      </AuthProvider>
    );

    fireEvent.click(await screen.findByText('MediQ City Hospital — Main Campus'));
    fireEvent.click(await screen.findByText('General OPD Consultation'));

    const slotButton = await screen.findByText('09:00');
    fireEvent.click(slotButton);

    expect(await screen.findByText('The selected appointment slot is no longer available.')).toBeInTheDocument();
  });
});
