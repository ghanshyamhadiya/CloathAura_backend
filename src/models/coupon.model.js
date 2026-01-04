import mongoose, { Schema } from "mongoose";

const couponSchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  type: {
    type: String,
    enum: ["welcome", "user", "universal", "loyalty"],
    required: true,
  },
  discountType: {
    type: String,
    enum: ["percentage", "fixed"],
    required: true,
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0,
  },
  validFrom: {
    type: Date,
    required: true,
  },
  validUntil: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  usageLimit: {
    type: Number,
    min: 0,
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  minimumOrderValue: {
    type: Number,
    min: 0,
    default: 0,
  },
  maximumDiscount: {
    type: Number,
    min: 0,
  },
  applicableProducts: [{
    type: Schema.Types.ObjectId,
    ref: "Product",
  }],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
}, { timestamps: true });

const userCouponSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  couponId: {
    type: Schema.Types.ObjectId,
    ref: "Coupon",
    required: true,
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  usedAt: {
    type: Date,
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: "Order",
  },
}, { timestamps: true });

const couponUsageSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  couponId: {
    type: Schema.Types.ObjectId,
    ref: "Coupon",
    required: true,
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: "Order",
  },
}, { timestamps: true });

couponSchema.index({ code: 1 });
couponSchema.index({ type: 1, isActive: 1 });
couponSchema.index({ validFrom: 1, validUntil: 1 });
userCouponSchema.index({ userId: 1, couponId: 1, isUsed: 1 });
userCouponSchema.index({ userId: 1, isUsed: 1 });
couponUsageSchema.index({ userId: 1, couponId: 1 });

couponSchema.statics.createWelcomeCoupon = async function (userId) {
  try {
    const UserCoupon = mongoose.model("UserCoupon");
    const existingWelcome = await UserCoupon.findOne({
      userId: userId,
    }).populate({
      path: 'couponId',
      match: { type: 'welcome' }
    });

    if (existingWelcome && existingWelcome.couponId) {
      console.log('User already has welcome coupon');
      return existingWelcome.couponId;
    }

    const uniqueCode = `WELCOME${userId.toString().slice(-6).toUpperCase()}`;
    
    const welcomeCoupon = new this({
      code: uniqueCode,
      name: "Welcome Bonus",
      description: "Welcome to our store! Enjoy 10% off on your first order",
      type: "welcome",
      discountType: "percentage",
      discountValue: 10,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      minimumOrderValue: 500,
      maximumDiscount: 1000,
      isActive: true,
    });

    await welcomeCoupon.save();

    const userCoupon = new UserCoupon({
      userId,
      couponId: welcomeCoupon._id,
    });

    await userCoupon.save();
    
    console.log(`Welcome coupon ${uniqueCode} created for user ${userId}`);
    return welcomeCoupon;
  } catch (error) {
    console.error("Error creating welcome coupon:", error);
    throw error;
  }
};

couponSchema.statics.assignUniversalCouponsToUser = async function (userId) {
  try {
    const CouponUsage = mongoose.model("CouponUsage");
    
    const universalCoupons = await this.find({
      type: "universal",
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() },
      $or: [
        { usageLimit: { $exists: false } },
        { $expr: { $lt: ["$usageCount", "$usageLimit"] } },
      ],
    });

    if (universalCoupons.length === 0) {
      console.log('No universal coupons available');
      return [];
    }

    const usageRecords = universalCoupons.map((coupon) => ({
      userId,
      couponId: coupon._id,
      orderId: null,
    }));

    await CouponUsage.insertMany(usageRecords);
    
    console.log(`${usageRecords.length} universal coupons assigned to user ${userId}`);
    return universalCoupons;
  } catch (error) {
    console.error("Error assigning universal coupons:", error);
    throw error;
  }
};

couponSchema.statics.assignLoyaltyCoupon = async function (userId) {
  try {
    const UserCoupon = mongoose.model("UserCoupon");
    
    const existingLoyaltyCoupon = await UserCoupon.findOne({
      userId,
      isUsed: false,
    }).populate({
      path: 'couponId',
      match: { type: 'loyalty' }
    });

    if (existingLoyaltyCoupon && existingLoyaltyCoupon.couponId) {
      console.log('User already has an unused loyalty coupon');
      return null;
    }

    const uniqueCode = `LOYALTY${userId.toString().slice(-4).toUpperCase()}${Date.now().toString().slice(-4)}`;
    
    const loyaltyCoupon = new this({
      code: uniqueCode,
      name: "Loyalty Reward",
      description: "Thank you for being a loyal customer! Enjoy ₹200 off",
      type: "loyalty",
      discountType: "fixed",
      discountValue: 200,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      minimumOrderValue: 1000,
      maximumDiscount: 200,
      isActive: true,
    });

    await loyaltyCoupon.save();

    const userCoupon = new UserCoupon({
      userId,
      couponId: loyaltyCoupon._id,
    });

    await userCoupon.save();
    
    console.log(`Loyalty coupon ${uniqueCode} created for user ${userId}`);
    return loyaltyCoupon;
  } catch (error) {
    console.error("Error creating loyalty coupon:", error);
    throw error;
  }
};

couponSchema.statics.applyCoupon = async function (
  couponCode,
  userId,
  orderId,
  subtotal,
  productIds,
  user
) {
  try {
    const coupon = await this.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() }
    });

    if (!coupon) {
      return { isValid: false, message: "Coupon not found or expired" };
    }

    if (coupon.minimumOrderValue && subtotal < coupon.minimumOrderValue) {
      return {
        isValid: false,
        message: `Minimum order value ₹${coupon.minimumOrderValue}`
      };
    }

    if (coupon.applicableProducts?.length) {
      const allowed = coupon.applicableProducts.some(id =>
        productIds.includes(id.toString())
      );
      if (!allowed) {
        return { isValid: false, message: "Coupon not applicable" };
      }
    }

    if (
      coupon.type === "universal" &&
      coupon.usageLimit &&
      coupon.usageCount >= coupon.usageLimit
    ) {
      return { isValid: false, message: "Coupon usage limit reached" };
    }

    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = (coupon.discountValue / 100) * subtotal;
      if (coupon.maximumDiscount) {
        discountAmount = Math.min(discountAmount, coupon.maximumDiscount);
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, subtotal);
    }

    const UserCoupon = mongoose.model("UserCoupon");
    const CouponUsage = mongoose.model("CouponUsage");
    const Order = mongoose.model("Order");

    if (coupon.type === "welcome") {
      let userCoupon = await UserCoupon.findOne({
        userId,
        couponId: coupon._id,
        isUsed: false
      });

      if (!userCoupon) {
        userCoupon = await UserCoupon.create({ userId, couponId: coupon._id });
      }

      const existingOrder = await Order.findOne({
        userId,
        status: { $in: ["processing", "shipped", "delivered"] }
      });

      if (existingOrder) {
        return { isValid: false, message: "Welcome coupon already used" };
      }

      const createdAt = user?.createdAt || user?.accountCreatedAt;
      if (createdAt) {
        const days = (Date.now() - new Date(createdAt)) / 86400000;
        if (days > 30) {
          return { isValid: false, message: "Welcome coupon expired" };
        }
      }
    }

    if (coupon.type === "user" || coupon.type === "loyalty") {
      let userCoupon = await UserCoupon.findOne({
        userId,
        couponId: coupon._id,
        isUsed: false
      });

      if (!userCoupon) {
        userCoupon = await UserCoupon.create({ userId, couponId: coupon._id });
      }
    }

    if (coupon.type === "universal") {
      let usage = await CouponUsage.findOne({
        userId,
        couponId: coupon._id,
        orderId: null
      });

      if (!usage) {
        usage = await CouponUsage.create({
          userId,
          couponId: coupon._id,
          orderId: null
        });
      }
    }

    return {
      isValid: true,
      coupon,
      discountAmount,
      message: `Coupon applied. You saved ₹${discountAmount.toFixed(2)}`
    };
  } catch (error) {
    return {
      isValid: false,
      message: "Coupon validation failed",
      error: error.message
    };
  }
};


export const Coupon = mongoose.model("Coupon", couponSchema);
export const UserCoupon = mongoose.model("UserCoupon", userCouponSchema);
export const CouponUsage = mongoose.model("CouponUsage", couponUsageSchema);