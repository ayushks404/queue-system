import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

export async function getNotifications(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.notification.count({
        where: { user_id: userId }
      }),
      prisma.notification.count({
        where: { user_id: userId, is_read: false }
      })
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          unreadCount
        }
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch notifications'
      }
    });
  }
}

export async function markAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id }
    });

    if (!notification) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Notification not found'
        }
      });
      return;
    }

    if (notification.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { is_read: true }
    });

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update notification'
      }
    });
  }
}

export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    await prisma.notification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true }
    });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update notifications'
      }
    });
  }
}
