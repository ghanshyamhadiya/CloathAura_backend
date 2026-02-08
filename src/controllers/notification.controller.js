import mongoose from "mongoose";
import httpStatus from "http-status";
import Notification from "../models/notification.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import { io } from "../app.js";

export const getUserNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        const { page = 1, limit = 20, unreadOnly = false, type } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const query = { userId };

        if (unreadOnly === 'true') {
            query.isRead = false;
        }

        if (type) {
            query.type = type;
        }

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(query)
                .populate('relatedOrder', 'items totalAmount status approvalStatus')
                .populate('relatedProduct', 'name')
                .populate('relatedUser', 'username')
                .sort({ createdAt: -1 })
                .limit(limitNum)
                .skip(skip)
                .lean(),
            Notification.countDocuments(query),
            Notification.getUnreadCount(userId)
        ]);

        res.status(httpStatus.OK).json({
            success: true,
            notifications,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
                hasNext: pageNum * limitNum < total,
                hasPrevious: pageNum > 1
            },
            unreadCount
        });

    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to fetch notifications",
            code: "FETCH_FAILED"
        });
    }
};

export const markAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        const { notificationIds } = req.body;

        if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
            return res.status(httpStatus.BAD_REQUEST).json({
                success: false,
                message: "Notification IDs array is required",
                code: "INVALID_IDS"
            });
        }

        const validIds = notificationIds.filter(id => mongoose.Types.ObjectId.isValid(id));

        if (validIds.length === 0) {
            return res.status(httpStatus.BAD_REQUEST).json({
                success: false,
                message: "No valid notification IDs provided",
                code: "INVALID_IDS"
            });
        }

        await Notification.markAsRead(validIds, userId);
        const unreadCount = await Notification.getUnreadCount(userId);

        // Emit real-time update
        io.to(`user:${userId}`).emit('notifications:updated', {
            unreadCount,
            readIds: validIds
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Notifications marked as read",
            unreadCount
        });

    } catch (error) {
        console.error("Error marking notifications as read:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to mark notifications as read",
            code: "UPDATE_FAILED"
        });
    }
};

export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.userId;

        await Notification.markAllAsRead(userId);

        // Emit real-time update
        io.to(`user:${userId}`).emit('notifications:updated', {
            unreadCount: 0,
            markAllRead: true
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "All notifications marked as read",
            unreadCount: 0
        });

    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to mark all notifications as read",
            code: "UPDATE_FAILED"
        });
    }
};

export const respondToOrderApproval = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const userId = req.userId;
        const { notificationId } = req.params;
        const { response, reason } = req.body;

        if (!response || !['approved', 'rejected'].includes(response)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(httpStatus.BAD_REQUEST).json({
                success: false,
                message: "Valid response (approved/rejected) is required",
                code: "INVALID_RESPONSE"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(notificationId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(httpStatus.BAD_REQUEST).json({
                success: false,
                message: "Invalid notification ID",
                code: "INVALID_ID"
            });
        }

        const notification = await Notification.findOne({
            _id: notificationId,
            userId: userId,
            type: 'order_approval_request',
            requiresAction: true,
            actionTaken: false
        }).session(session);

        if (!notification) {
            await session.abortTransaction();
            session.endSession();
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "Notification not found or already actioned",
                code: "NOT_FOUND"
            });
        }

        const order = await Order.findById(notification.relatedOrder)
            .populate('items.productId', 'owner name')
            .populate('userId', 'username email')
            .session(session);

        if (!order) {
            await session.abortTransaction();
            session.endSession();
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "Order not found",
                code: "ORDER_NOT_FOUND"
            });
        }

        // Verify user is owner of at least one product in the order
        const isOwner = order.items.some(item =>
            item.productId?.owner?.toString() === userId
        );

        if (!isOwner) {
            await session.abortTransaction();
            session.endSession();
            return res.status(httpStatus.FORBIDDEN).json({
                success: false,
                message: "You are not authorized to approve this order",
                code: "UNAUTHORIZED"
            });
        }

        // Update notification
        notification.actionTaken = true;
        notification.actionResponse = response;
        notification.isRead = true;
        await notification.save({ session });

        // Add to approval history
        order.approvalHistory.push({
            ownerId: userId,
            action: response,
            reason: reason || '',
            timestamp: new Date()
        });

        // Add to ownersApproved
        const existingApprovalIndex = order.ownersApproved.findIndex(
            a => a.ownerId.toString() === userId
        );

        if (existingApprovalIndex >= 0) {
            order.ownersApproved[existingApprovalIndex] = {
                ownerId: userId,
                approvedAt: new Date(),
                response
            };
        } else {
            order.ownersApproved.push({
                ownerId: userId,
                approvedAt: new Date(),
                response
            });
        }

        // Get unique product owners from order
        const uniqueOwnerIds = [...new Set(
            order.items
                .map(item => item.productId?.owner?.toString())
                .filter(Boolean)
        )];

        const allOwnersResponded = uniqueOwnerIds.every(ownerId =>
            order.ownersApproved.some(approval =>
                approval.ownerId.toString() === ownerId && approval.response
            )
        );

        const anyRejected = order.ownersApproved.some(approval =>
            approval.response === 'rejected'
        );

        if (response === 'rejected') {
            order.approvalStatus = 'rejected';
            order.status = 'cancelled';
            order.rejectedAt = new Date();
            order.rejectionReason = reason || 'Order rejected by product owner';

            // Restore stock
            for (const item of order.items) {
                const product = await Product.findById(item.productId).session(session);
                if (product) {
                    const variant = product.variants.id(item.variantId);
                    if (variant) {
                        const size = variant.sizes.id(item.sizeId);
                        if (size) {
                            size.stock += item.quantity;
                            await product.save({ session });
                        }
                    }
                }
            }

            // Notify customer
            const customerNotification = await Notification.create([{
                userId: order.userId,
                type: 'order_rejected',
                title: 'Order Rejected',
                message: `Your order #${order._id.toString().slice(-6)} has been rejected. ${reason || ''}`,
                relatedOrder: order._id,
                actionUrl: `/orders/${order._id}`,
                requiresAction: false
            }], { session });

            io.to(`user:${order.userId.toString()}`).emit('order:rejected', {
                order: order,
                notification: customerNotification[0]
            });

        } else if (allOwnersResponded && !anyRejected) {
            order.approvalStatus = 'approved';
            order.status = 'processing';
            order.approvedAt = new Date();

            // Notify customer
            const customerNotification = await Notification.create([{
                userId: order.userId,
                type: 'order_approved',
                title: 'Order Approved',
                message: `Your order #${order._id.toString().slice(-6)} has been approved and is now being processed!`,
                relatedOrder: order._id,
                actionUrl: `/orders/${order._id}`,
                requiresAction: false
            }], { session });

            io.to(`user:${order.userId.toString()}`).emit('order:approved', {
                order: order,
                notification: customerNotification[0]
            });
        }

        await order.save({ session });

        await session.commitTransaction();
        session.endSession();

        const unreadCount = await Notification.getUnreadCount(userId);
        io.to(`user:${userId}`).emit('notifications:updated', { unreadCount });

        res.status(httpStatus.OK).json({
            success: true,
            message: `Order ${response} successfully`,
            order: order,
            approvalStatus: order.approvalStatus
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error responding to order approval:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to process approval response",
            code: "APPROVAL_FAILED",
            error: process.env.NODE_ENV === "development" ? error.message : undefined
        });
    }
};

export const deleteNotification = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(httpStatus.BAD_REQUEST).json({
                success: false,
                message: "Invalid notification ID",
                code: "INVALID_ID"
            });
        }

        const notification = await Notification.findOneAndDelete({
            _id: id,
            userId: userId
        });

        if (!notification) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "Notification not found",
                code: "NOT_FOUND"
            });
        }

        const unreadCount = await Notification.getUnreadCount(userId);
        io.to(`user:${userId}`).emit('notifications:updated', { unreadCount });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Notification deleted successfully",
            unreadCount
        });

    } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to delete notification",
            code: "DELETE_FAILED"
        });
    }
};

export const getUnreadCount = async (req, res) => {
    try {
        const userId = req.userId;
        const unreadCount = await Notification.getUnreadCount(userId);

        res.status(httpStatus.OK).json({
            success: true,
            unreadCount
        });

    } catch (error) {
        console.error("Error getting unread count:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to get unread count",
            code: "FETCH_FAILED"
        });
    }
};
