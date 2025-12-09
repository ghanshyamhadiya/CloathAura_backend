import mongoose, { Schema } from "mongoose";

const orderSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        variantId: {
            type: Schema.Types.ObjectId,
            required: true
        },
        sizeId: {
            type: Schema.Types.ObjectId,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        unitPrice: {
            type: Number,
            required: true,
            min: 0
        }
    }],
    // IMPORTANT: Store original amount before discount
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    // Final amount after discount
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    shippingAddress: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        postalCode: { type: String, required: true }
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'card', 'upi', 'wallet'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    // Enhanced coupon tracking
    coupon: {
        code: {
            type: String
        },
        couponId: {
            type: Schema.Types.ObjectId,
            ref: "Coupon"
        },
        discountAmount: {
            type: Number,
            min: 0,
            default: 0
        },
        type: {
            type: String,
            enum: ['universal', 'welcome', 'user-specific', 'loyalty']
        }
    }
}, {
    timestamps: true
});

// Add index for faster queries
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'coupon.couponId': 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;