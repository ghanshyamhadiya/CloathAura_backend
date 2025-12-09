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

// Indexes for performance
couponSchema.index({ code: 1 });
couponSchema.index({ type: 1, isActive: 1 });
couponSchema.index({ validFrom: 1, validUntil: 1 });
userCouponSchema.index({ userId: 1, couponId: 1, isUsed: 1 });
userCouponSchema.index({ userId: 1, isUsed: 1 });
couponUsageSchema.index({ userId: 1, couponId: 1 });

// Create welcome coupon for new user
couponSchema.statics.createWelcomeCoupon = async function (userId) {
  try {
    // Check if user already has a welcome coupon
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

    // Generate unique code
    const uniqueCode = `WELCOME${userId.toString().slice(-6).toUpperCase()}`;
    
    // Create welcome coupon
    const welcomeCoupon = new this({
      code: uniqueCode,
      name: "Welcome Bonus",
      description: "Welcome to our store! Enjoy 10% off on your first order",
      type: "welcome",
      discountType: "percentage",
      discountValue: 10,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      minimumOrderValue: 500,
      maximumDiscount: 1000,
      isActive: true,
    });

    await welcomeCoupon.save();

    // Assign to user
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

// Assign universal coupons to new user
couponSchema.statics.assignUniversalCouponsToUser = async function (userId) {
  try {
    const CouponUsage = mongoose.model("CouponUsage");
    
    // Find all active universal coupons
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

    // Create usage records for each universal coupon
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

// Assign loyalty coupon on milestone
couponSchema.statics.assignLoyaltyCoupon = async function (userId) {
  try {
    const UserCoupon = mongoose.model("UserCoupon");
    
    // Check if user already has an unused loyalty coupon
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

    // Generate unique code
    const uniqueCode = `LOYALTY${userId.toString().slice(-4).toUpperCase()}${Date.now().toString().slice(-4)}`;
    
    // Create loyalty coupon
    const loyaltyCoupon = new this({
      code: uniqueCode,
      name: "Loyalty Reward",
      description: "Thank you for being a loyal customer! Enjoy ₹200 off",
      type: "loyalty",
      discountType: "fixed",
      discountValue: 200,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      minimumOrderValue: 1000,
      maximumDiscount: 200,
      isActive: true,
    });

    await loyaltyCoupon.save();

    // Assign to user
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

// Apply coupon validation logic
couponSchema.statics.applyCoupon = async function (couponCode, userId, orderId, subtotal, productIds, user) {
  try {
    const coupon = await this.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() },
    });

    if (!coupon) {
      return { isValid: false, message: "Coupon not found or expired" };
    }

    // Check minimum order value
    if (coupon.minimumOrderValue && subtotal < coupon.minimumOrderValue) {
      return {
        isValid: false,
        message: `Minimum order value of ₹${coupon.minimumOrderValue} required`,
      };
    }

    // Check applicable products
    if (coupon.applicableProducts && coupon.applicableProducts.length > 0) {
      const applicable = coupon.applicableProducts.some((productId) =>
        productIds.includes(productId.toString())
      );
      if (!applicable) {
        return {
          isValid: false,
          message: "Coupon not applicable to products in your cart",
        };
      }
    }

    // Check usage limit for universal coupons
    if (coupon.type === 'universal' && coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return { isValid: false, message: "Coupon usage limit reached" };
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = (coupon.discountValue / 100) * subtotal;
      if (coupon.maximumDiscount && discountAmount > coupon.maximumDiscount) {
        discountAmount = coupon.maximumDiscount;
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, subtotal);
    }

    // Type-specific validation
    const UserCoupon = mongoose.model("UserCoupon");
    const CouponUsage = mongoose.model("CouponUsage");
    const Order = mongoose.model("Order");

    switch (coupon.type) {
      case "welcome":
        // Check if user has this coupon assigned
        const welcomeUserCoupon = await UserCoupon.findOne({
          userId,
          couponId: coupon._id,
          isUsed: false,
        });
        
        if (!welcomeUserCoupon) {
          return {
            isValid: false,
            message: "Welcome coupon not available for your account",
          };
        }

        // Check if this is first order
        const orderCount = await Order.countDocuments({
          userId,
          status: { $in: ["pending", "processing", "shipped", "delivered"] },
        });
        
        if (orderCount > 0) {
          return {
            isValid: false,
            message: "Welcome coupon is only valid for your first order",
          };
        }

        // Check if within 30 days of registration
        const daysSinceReg = (new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24);
        if (daysSinceReg > 30) {
          return {
            isValid: false,
            message: "Welcome coupon expired (valid for 30 days after registration)",
          };
        }
        break;

      case "user":
        // Check if user has this coupon assigned and unused
        const userCoupon = await UserCoupon.findOne({
          userId,
          couponId: coupon._id,
          isUsed: false,
        });
        
        if (!userCoupon) {
          return {
            isValid: false,
            message: "This coupon is not available for your account",
          };
        }
        break;

      case "universal":
        // Check if user has this coupon assigned and unused
        const couponUsage = await CouponUsage.findOne({
          userId,
          couponId: coupon._id,
          orderId: null,
        });
        
        if (!couponUsage) {
          return {
            isValid: false,
            message: "This coupon has already been used or is not available",
          };
        }
        break;

      case "loyalty":
        // Check if user has this coupon assigned and unused
        const loyaltyCoupon = await UserCoupon.findOne({
          userId,
          couponId: coupon._id,
          isUsed: false,
        });
        
        if (!loyaltyCoupon) {
          return {
            isValid: false,
            message: "Loyalty coupon not available for your account",
          };
        }
        break;

      default:
        return { isValid: false, message: "Invalid coupon type" };
    }

    return {
      isValid: true,
      discountAmount,
      coupon,
      message: `Coupon applied successfully! You saved ₹${discountAmount.toFixed(2)}`,
    };
  } catch (error) {
    console.error("Error applying coupon:", error);
    return {
      isValid: false,
      message: "Error validating coupon",
      error: error.message,
    };
  }
};

export const Coupon = mongoose.model("Coupon", couponSchema);
export const UserCoupon = mongoose.model("UserCoupon", userCouponSchema);
export const CouponUsage = mongoose.model("CouponUsage", couponUsageSchema);