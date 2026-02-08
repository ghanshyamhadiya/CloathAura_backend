import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: [
            'order_approval_request',
            'order_approved',
            'order_rejected',
            'order_status_update',
            'coupon_assigned',
            'product_update',
            'system_announcement'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    relatedOrder: {
        type: Schema.Types.ObjectId,
        ref: "Order"
    },
    relatedProduct: {
        type: Schema.Types.ObjectId,
        ref: "Product"
    },
    relatedUser: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    actionUrl: {
        type: String
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    requiresAction: {
        type: Boolean,
        default: false
    },
    actionTaken: {
        type: Boolean,
        default: false
    },
    actionResponse: {
        type: String,
        enum: ['approved', 'rejected', null],
        default: null
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Indexes for better query performance
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, requiresAction: 1, actionTaken: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });

// Static method to create notification
notificationSchema.statics.createNotification = async function (data) {
    try {
        const notification = new this(data);
        await notification.save();
        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
};

// Static method to mark as read
notificationSchema.statics.markAsRead = async function (notificationIds, userId) {
    try {
        const result = await this.updateMany(
            {
                _id: { $in: notificationIds },
                userId: userId
            },
            {
                isRead: true
            }
        );
        return result;
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        throw error;
    }
};

// Static method to mark all as read
notificationSchema.statics.markAllAsRead = async function (userId) {
    try {
        const result = await this.updateMany(
            { userId: userId, isRead: false },
            { isRead: true }
        );
        return result;
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        throw error;
    }
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = async function (userId) {
    try {
        const count = await this.countDocuments({
            userId: userId,
            isRead: false
        });
        return count;
    } catch (error) {
        console.error('Error getting unread count:', error);
        throw error;
    }
};

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
