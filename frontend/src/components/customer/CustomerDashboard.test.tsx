import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerDashboard } from './CustomerDashboard';
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

const mockUser = { id: 'u1', email: 'patient@queue.local', name: 'Jane Patient', role: 'CUSTOMER' };

const mockAppointments = [
  {
    id: 'apt-1',
    appointment_number: 'APT-2026-000101',
    branch_id: 'b1',
    service_id: 's1',
    appointment_date: '2026-09-20',
    start_time: '10:00',
    status: 'CONFIRMED',
    service: { name: 'General OPD Consultation' },
    branch: { name: 'MediQ City Hospital — Main Campus' },
  },
];

describe('CustomerDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem('accessToken', 'test_token');
  });

  it('renders upcoming appointments and tab controls', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ user: mockUser });
      if (url === '/appointments') return Promise.resolve({ appointments: mockAppointments });
      if (url === '/waitlist/me') return Promise.resolve({ waitlist: [] });
      return Promise.resolve({});
    });

    render(
      <AuthProvider>
        <CustomerDashboard />
      </AuthProvider>
    );

    expect(await screen.findByText('APT-2026-000101')).toBeInTheDocument();
    expect(screen.getByText('General OPD Consultation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reschedule/i })).toBeInTheDocument();
  });

  it('opens cancel modal and confirms appointment cancellation', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ user: mockUser });
      if (url === '/appointments') return Promise.resolve({ appointments: mockAppointments });
      if (url === '/waitlist/me') return Promise.resolve({ waitlist: [] });
      return Promise.resolve({});
    });

    (api.patch as any).mockResolvedValueOnce({
      appointment: { ...mockAppointments[0], status: 'CANCELLED' },
    });

    render(
      <AuthProvider>
        <CustomerDashboard />
      </AuthProvider>
    );

    expect(await screen.findByText('APT-2026-000101')).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);

    // Cancel modal appears
    expect(screen.getByText('Cancel Appointment')).toBeInTheDocument();
    const confirmCancelBtn = screen.getByRole('button', { name: 'Confirm Cancellation' });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/appointments/apt-1/cancel', expect.any(Object));
    });
  });

  it('opens reschedule modal, loads slots on date selection, and submits reschedule', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ user: mockUser });
      if (url === '/appointments') return Promise.resolve({ appointments: mockAppointments });
      if (url === '/waitlist/me') return Promise.resolve({ waitlist: [] });
      if (url.includes('/availability')) {
        return Promise.resolve({ available_slots: ['11:30', '14:00'] });
      }
      return Promise.resolve({});
    });

    (api.patch as any).mockResolvedValueOnce({
      appointment: { ...mockAppointments[0], start_time: '11:30' },
    });

    const { container } = render(
      <AuthProvider>
        <CustomerDashboard />
      </AuthProvider>
    );

    expect(await screen.findByText('APT-2026-000101')).toBeInTheDocument();

    const rescheduleBtn = screen.getByRole('button', { name: /Reschedule/i });
    fireEvent.click(rescheduleBtn);

    expect(screen.getByText('Reschedule Appointment')).toBeInTheDocument();

    // Trigger date change to load slots
    const dateInput = container.querySelector('input[type="date"]')!;
    fireEvent.change(dateInput, { target: { value: '2026-09-25' } });

    const slotButton = await screen.findByText('11:30');
    fireEvent.click(slotButton);

    const submitRescheduleBtn = screen.getByRole('button', { name: 'Confirm Reschedule' });
    expect(submitRescheduleBtn).not.toBeDisabled();
    fireEvent.click(submitRescheduleBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/appointments/apt-1/reschedule', {
        new_slot_date: '2026-09-25',
        new_slot_time: '11:30',
      });
    });
  });

  it('displays error message when reschedule fails because slot is unavailable', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ user: mockUser });
      if (url === '/appointments') return Promise.resolve({ appointments: mockAppointments });
      if (url === '/waitlist/me') return Promise.resolve({ waitlist: [] });
      if (url.includes('/availability')) {
        return Promise.resolve({ available_slots: ['11:30'] });
      }
      return Promise.resolve({});
    });

    (api.patch as any).mockRejectedValueOnce(new Error('Selected slot is no longer available'));

    const { container } = render(
      <AuthProvider>
        <CustomerDashboard />
      </AuthProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Reschedule/i }));

    const dateInput = container.querySelector('input[type="date"]')!;
    fireEvent.change(dateInput, { target: { value: '2026-09-25' } });

    fireEvent.click(await screen.findByText('11:30'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Reschedule' }));

    expect(await screen.findByText('Selected slot is no longer available')).toBeInTheDocument();
  });
});
