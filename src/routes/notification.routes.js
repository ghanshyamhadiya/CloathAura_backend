import express from 'express';
import { authenticationToken as authenticate } from '../middleware/auth.js';
import {
    getUserNotifications,
    markAsRead,
    markAllAsRead,
    respondToOrderApproval,
    deleteNotification,
    getUnreadCount
} from '../controllers/notification.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get unread count (must be before /notifications to avoid route conflict)
router.get('/notifications/unread-count', getUnreadCount);

// Mark specific notifications as read
router.put('/notifications/read', markAsRead);

// Mark all notifications as read
router.put('/notifications/read-all', markAllAsRead);

// Respond to order approval request
router.post('/notifications/:notificationId/respond', respondToOrderApproval);

// Delete notification
router.delete('/notifications/:id', deleteNotification);

// Get user notifications with pagination and filters (must be last among /notifications routes)
router.get('/notifications', getUserNotifications);

export default router;
