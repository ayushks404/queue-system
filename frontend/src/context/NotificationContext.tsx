import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Notification } from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  isDrawerOpen: boolean;
  toasts: ToastMessage[];
  setIsDrawerOpen: (open: boolean) => void;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissToast: (id: string) => void;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const fetchNotifications = useCallback(async () => {
    if (!token || !user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setIsLoading(true);
    try {
      const data = await api.get<{ notifications: Notification[]; pagination: { unreadCount: number; unread_count?: number } }>(
        '/notifications?limit=30'
      );
      setNotifications(data.notifications || []);
      setUnreadCount(data.pagination?.unreadCount ?? data.pagination?.unread_count ?? (data.notifications || []).filter((n) => !n.is_read).length);
    } catch (err) {
      console.warn('Failed to fetch notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notif: Notification) => {
      setNotifications((prev) => [notif, ...prev]);
      setUnreadCount((prev) => prev + 1);
      const formattedTitle = notif.type
        ? notif.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
        : 'New Notification';
      addToast({
        type: 'info',
        title: formattedTitle,
        message: notif.message,
      });
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket, addToast]);

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        isDrawerOpen,
        toasts,
        setIsDrawerOpen,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        dismissToast,
        addToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
