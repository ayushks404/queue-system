import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StaffDashboard } from './StaffDashboard';
import { api } from '../../api/client';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../context/SocketContext', () => ({
  useSocket: () => ({
    socket: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
    isConnected: true,
    joinBranch: vi.fn(),
    activeBranchId: 'b1',
  }),
}));

const mockBranches = [
  { id: 'b1', name: 'MediQ City Hospital — Main Campus', address: '12 MG Road', phone: '+91 124 4567890', is_active: true },
];

const mockServices = [
  { id: 's1', name: 'General OPD Consultation', duration_minutes: 15, price: 300, capacity: 1, is_active: true },
];

const mockQueueEntries = [
  {
    id: 'q1',
    branch_id: 'b1',
    queue_number: 101,
    customer_name: 'Alice Smith',
    priority: 'EMERGENCY',
    priority_rank: 3,
    status: 'WAITING',
    created_at: new Date().toISOString(),
  },
  {
    id: 'q2',
    branch_id: 'b1',
    queue_number: 102,
    customer_name: 'Bob Johnson',
    priority: 'NORMAL',
    priority_rank: 1,
    status: 'WAITING',
    created_at: new Date().toISOString(),
  },
];

describe('StaffDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders queue entries from branch in priority order', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/branches') return Promise.resolve({ branches: mockBranches });
      if (url === '/services') return Promise.resolve({ services: mockServices });
      if (url.startsWith('/queue/branch/')) return Promise.resolve({ queue: mockQueueEntries });
      if (url.startsWith('/appointments')) return Promise.resolve({ appointments: [] });
      return Promise.resolve({});
    });

    render(<StaffDashboard />);

    expect(await screen.findByText('Staff Operations Dashboard')).toBeInTheDocument();
    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText('#102')).toBeInTheDocument();
  });

  it('calls next patient endpoint when clicking Call Next Patient', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/branches') return Promise.resolve({ branches: mockBranches });
      if (url === '/services') return Promise.resolve({ services: mockServices });
      if (url.startsWith('/queue/branch/')) return Promise.resolve({ queue: mockQueueEntries });
      if (url.startsWith('/appointments')) return Promise.resolve({ appointments: [] });
      return Promise.resolve({});
    });

    (api.post as any).mockResolvedValueOnce({
      queueEntry: {
        ...mockQueueEntries[0],
        status: 'CALLED',
      },
    });

    render(<StaffDashboard />);

    const callNextBtn = await screen.findByRole('button', { name: /Call Next Patient/i });
    await waitFor(() => {
      expect(callNextBtn).not.toBeDisabled();
    });

    fireEvent.click(callNextBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/queue/b1/call-next');
    });
  });

  it('disables call-next button when queue is empty', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/branches') return Promise.resolve({ branches: mockBranches });
      if (url === '/services') return Promise.resolve({ services: mockServices });
      if (url.startsWith('/queue/branch/')) return Promise.resolve({ queue: [] });
      if (url.startsWith('/appointments')) return Promise.resolve({ appointments: [] });
      return Promise.resolve({});
    });

    render(<StaffDashboard />);

    await screen.findByText('Staff Operations Dashboard');

    const callNextBtn = screen.getByRole('button', { name: /Call Next Patient/i });
    expect(callNextBtn).toBeDisabled();
  });

  it('opens walk-in modal and submits new walk-in patient', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/branches') return Promise.resolve({ branches: mockBranches });
      if (url === '/services') return Promise.resolve({ services: mockServices });
      if (url.startsWith('/queue/branch/')) return Promise.resolve({ queue: mockQueueEntries });
      if (url.startsWith('/appointments')) return Promise.resolve({ appointments: [] });
      return Promise.resolve({});
    });

    (api.post as any).mockResolvedValueOnce({
      queue_entry: {
        id: 'q3',
        queue_number: 103,
        customer_name: 'Charlie Davis',
        status: 'WAITING',
      },
    });

    const { container } = render(<StaffDashboard />);

    const walkInBtn = await screen.findByRole('button', { name: /New Walk-In Patient/i });
    fireEvent.click(walkInBtn);

    expect(await screen.findByText('Register Walk-In Patient')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. John Doe'), {
      target: { value: 'Charlie Davis' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. +1 555 0199'), {
      target: { value: '+91 9876543210' },
    });

    const submitBtn = container.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/queue/walk-in', {
        branch_id: 'b1',
        service_id: undefined,
        customer_name: 'Charlie Davis',
        phone: '+91 9876543210',
        priority: 'NORMAL',
      });
    });
  });
});
