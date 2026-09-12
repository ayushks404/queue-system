import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthModal } from './AuthModal';
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

describe('AuthModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders login form inputs by default', () => {
    const { container } = render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={vi.fn()} defaultMode="login" />
      </AuthProvider>
    );

    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(container.querySelector('button[type="submit"]')).toHaveTextContent('Sign In');
  });

  it('submits valid credentials and calls login endpoint', async () => {
    const mockUser = { id: 'u1', email: 'test@example.com', name: 'Test User', role: 'CUSTOMER' };
    (api.post as any).mockResolvedValueOnce({
      user: mockUser,
      access_token: 'fake_jwt_token',
      refresh_token: 'fake_refresh_token',
    });

    const handleClose = vi.fn();
    const { container } = render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={handleClose} defaultMode="login" />
      </AuthProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    const submitBtn = container.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('displays an error message when login fails with 401', async () => {
    (api.post as any).mockRejectedValueOnce(new Error('Invalid email or password'));

    const handleClose = vi.fn();
    const { container } = render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={handleClose} defaultMode="login" />
      </AuthProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'wrongpassword' },
    });

    const submitBtn = container.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  it('switches to registration mode and renders full name field', () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={vi.fn()} defaultMode="login" />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(screen.getByPlaceholderText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('+1 555-0199')).toBeInTheDocument();
  });
});
