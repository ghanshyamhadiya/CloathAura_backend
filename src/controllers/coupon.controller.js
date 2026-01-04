import mongoose from "mongoose";
import httpStatus from "http-status";
import { io } from "../app.js";
import { Coupon, UserCoupon } from "../models/coupon.model.js";
import User from "../models/user.model.js";

export const createCoupon = async (req, res) => {
  try {
    const { 
      code, 
      name, 
      description, 
      type, 
      discountValue, 
      discountType, 
      minOrderAmount, 
      maxDiscountAmount, 
      usageLimit, 
      validFrom, 
      validUntil, 
      applicableProducts 
    } = req.body;

    if (!code || !name || !type || !discountValue || !discountType || !validFrom || !validUntil) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Required fields: code, name, type, discountValue, discountType, validFrom, validUntil"
      });
    }

    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Access denied. Admin or owner role required."
      });
    };

    const validFromDate = new Date(validFrom);
    const validUntilDate = new Date(validUntil);

    if (isNaN(validFromDate.getTime()) || isNaN(validUntilDate.getTime())) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid date format"
      });
    }

    if (validFromDate >= validUntilDate) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Valid until date must be after valid from date"
      });
    }

    if (discountValue < 0) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Discount value cannot be negative"
      });
    }

    if (discountType === 'percentage' && discountValue > 100) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Percentage discount cannot exceed 100%"
      });
    }

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(httpStatus.CONFLICT).json({
        success: false,
        message: "Coupon code already exists"
      });
    }

    const newCoupon = new Coupon({
      code: code.toUpperCase(),
      name,
      description,
      type,
      discountValue,
      discountType,
      minOrderAmount: Math.max(0, minOrderAmount || 0),
      maxDiscountAmount: maxDiscountAmount && maxDiscountAmount > 0 ? maxDiscountAmount : undefined,
      usageLimit: usageLimit && usageLimit > 0 ? usageLimit : undefined,
      validFrom: validFromDate,
      validUntil: validUntilDate,
      applicableProducts: applicableProducts || [],
      createdBy: req.userId
    });

    await newCoupon.save();

    io.to("role:admin").to("role:owner").emit("couponCreated", {
      coupon: newCoupon,
      createdBy: req.userId
    });

    res.status(httpStatus.CREATED).json({
      success: true,
      message: "Coupon created successfully",
      coupon: newCoupon
    });

  } catch (error) {
    console.error("Error creating coupon:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const getAllCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, isActive } = req.query;
    const userRole = req.userRole;
    const userId = req.userId;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    let query = {};
    
    if (userRole === 'admin' || userRole === 'owner') {
      if (type && ['universal', 'welcome', 'user', 'loyalty'].includes(type)) {  // Fixed enum to "user"
        query.type = type;
      }
      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }
    } else {
      query.isActive = true;
      query.validFrom = { $lte: new Date() };
      query.validUntil = { $gte: new Date() };
      
      if (type && type !== 'universal') {
        const userCoupons = await UserCoupon.find({ 
          userId: userId, 
          isUsed: false 
        }).select('couponId');
        const couponIds = userCoupons.map(uc => uc.couponId);
        query._id = { $in: couponIds };
      }
    }

    const coupons = await Coupon.find(query)
      .populate('createdBy', 'username')
      .populate('applicableProducts', 'name')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await Coupon.countDocuments(query);

    res.status(httpStatus.OK).json({
      success: true,
      coupons,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};


export const getUserCoupons = async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();

    const assignedCoupons = await UserCoupon.find({
      userId,
      isUsed: false
    })
      .populate({
        path: "couponId",
        match: {
          isActive: true,
          validFrom: { $lte: now },
          validUntil: { $gte: now }
        }
      })
      .lean();

    const assignedList = assignedCoupons
      .filter(c => c.couponId)
      .map(c => c.couponId);

    const usedUniversal = await CouponUsage.find({
      userId
    }).select("couponId");

    const usedIds = usedUniversal.map(u => u.couponId.toString());

    const universalCoupons = await Coupon.find({
      type: "universal",
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      _id: { $nin: usedIds },
      $or: [
        { usageLimit: { $exists: false } },
        { $expr: { $lt: ["$usageCount", "$usageLimit"] } }
      ]
    }).lean();

    res.json({
      success: true,
      coupons: [...assignedList, ...universalCoupons]
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load coupons"
    });
  }
};


export const validateCoupon = async (req, res) => {
  try {
    const { couponCode, orderAmount } = req.body;
    const userId = req.userId;
    
    if (!couponCode || orderAmount === undefined || orderAmount < 0) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Valid coupon code and order amount are required"
      });
    }
    
    const user = await User.findById(userId).populate('cart.product');
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "User not found"
      });
    }
    
    // Extract product IDs from populated cart (fixed to handle populated data)
    const productIds = user.cart
      .filter(item => item.product && item.product._id) // Ensure product exists and has _id
      .map(item => item.product._id.toString());

    // Fixed: Call applyCoupon instead of validateCoupon
    const validation = await Coupon.applyCoupon(
      couponCode, 
      userId, 
      null,  // orderId is null for validation
      orderAmount, 
      productIds,
      user // Pass the user object
    );
    
    res.status(httpStatus.OK).json({
      success: validation.isValid,
      message: validation.message,
      ...(validation.isValid && {
        coupon: validation.coupon,
        discountAmount: validation.discountAmount
      })
    });
  } catch (error) {
    console.error("Error validating coupon:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Access denied. Admin or owner role required."
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid coupon ID"
      });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Coupon not found"
      });
    }

    if (updateData.validFrom) {
      const validFromDate = new Date(updateData.validFrom);
      if (isNaN(validFromDate.getTime())) {
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: "Invalid validFrom date format"
        });
      }
      updateData.validFrom = validFromDate;
    }

    if (updateData.validUntil) {
      const validUntilDate = new Date(updateData.validUntil);
      if (isNaN(validUntilDate.getTime())) {
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: "Invalid validUntil date format"
        });
      }
      updateData.validUntil = validUntilDate;
    }

    if (updateData.validFrom && updateData.validUntil && updateData.validFrom >= updateData.validUntil) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Valid until date must be after valid from date"
      });
    }

    if (updateData.code) {
      const existingCoupon = await Coupon.findOne({ 
        code: updateData.code.toUpperCase(),
        _id: { $ne: id }
      });
      if (existingCoupon) {
        return res.status(httpStatus.CONFLICT).json({
          success: false,
          message: "Coupon code already exists"
        });
      }
      updateData.code = updateData.code.toUpperCase();
    }

    if (updateData.discountValue !== undefined && updateData.discountValue < 0) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Discount value cannot be negative"
      });
    }

    if (updateData.discountType === 'percentage' && updateData.discountValue > 100) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Percentage discount cannot exceed 100%"
      });
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'username');

    io.to("role:admin").to("role:owner").emit("couponUpdated", {
      coupon: updatedCoupon,
      updatedBy: req.userId
    });

    res.status(httpStatus.OK).json({
      success: true,
      message: "Coupon updated successfully",
      coupon: updatedCoupon
    });

  } catch (error) {
    console.error("Error updating coupon:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Access denied. Admin or owner role required."
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid coupon ID"
      });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Coupon not found"
      });
    }

    const usageCount = await UserCoupon.countDocuments({ 
      couponId: id, 
      isUsed: true 
    });

    if (usageCount > 0) {
      coupon.isActive = false;
      await coupon.save();

      return res.status(httpStatus.OK).json({
        success: true,
        message: "Coupon deactivated (has been used by customers)"
      });
    }

    await UserCoupon.deleteMany({ couponId: id });
    await Coupon.findByIdAndDelete(id);

    io.to("role:admin").to("role:owner").emit("couponDeleted", {
      couponId: id,
      deletedBy: req.userId
    });

    res.status(httpStatus.OK).json({
      success: true,
      message: "Coupon deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting coupon:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const assignCouponToUser = async (req, res) => {
  try {
    const { couponId, userId } = req.body;

    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Access denied. Admin or owner role required."
      });
    }

    if (!couponId || !userId) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Coupon ID and User ID are required"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(couponId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid coupon ID or user ID"
      });
    }

    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Coupon not found"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "User not found"
      });
    }

    const existingAssignment = await UserCoupon.findOne({
      userId: userId,
      couponId: couponId
    });

    if (existingAssignment) {
      return res.status(httpStatus.CONFLICT).json({
        success: false,
        message: "Coupon already assigned to this user"
      });
    }

    const userCoupon = new UserCoupon({
      userId: userId,
      couponId: couponId
    });

    await userCoupon.save();

    io.to(`user:${userId}`).emit("couponAssigned", {
      coupon: coupon,
      message: "New coupon assigned to your account!"
    });

    res.status(httpStatus.CREATED).json({
      success: true,
      message: "Coupon assigned successfully",
      assignment: userCoupon
    });

  } catch (error) {
    console.error("Error assigning coupon:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const getCouponAnalytics = async (req, res) => {
  try {
    const { couponId } = req.params;

    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Access denied. Admin or owner role required."
      });
    }
    
    if (couponId && !mongoose.Types.ObjectId.isValid(couponId)) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid coupon ID"
      });
    }

    const matchStage = couponId ? { couponId: new mongoose.Types.ObjectId(couponId) } : {};

    const analytics = await UserCoupon.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "coupons",
          localField: "couponId",
          foreignField: "_id",
          as: "coupon"
        }
      },
      { $unwind: "$coupon" },
      {
        $group: {
          _id: "$couponId",
          couponCode: { $first: "$coupon.code" },
          couponName: { $first: "$coupon.name" },
          totalAssigned: { $sum: 1 },
          totalUsed: { $sum: { $cond: ["$isUsed", 1, 0] } },
          totalUnused: { $sum: { $cond: ["$isUsed", 0, 1] } }
        }
      },
      {
        $addFields: {
          usagePercentage: {
            $cond: [
              { $eq: ["$totalAssigned", 0] },
              0,
              { $multiply: [{ $divide: ["$totalUsed", "$totalAssigned"] }, 100] }
            ]
          }
        }
      },
      { $sort: { totalUsed: -1 } }
    ]);

    res.status(httpStatus.OK).json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error("Error fetching coupon analytics:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};