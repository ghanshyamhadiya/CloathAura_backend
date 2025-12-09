import mongoose from "mongoose";
import httpStatus from "http-status";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import { io } from "../app.js";
import { Coupon, UserCoupon, CouponUsage } from "../models/coupon.model.js";

// CREATE ORDER
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { shippingAddress, quantities, paymentMethod, couponCode } = req.body;
    const userId = req.userId;

    // Validate required fields
    if (!shippingAddress) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Shipping address is required",
        code: "MISSING_SHIPPING_ADDRESS",
      });
    }

    if (!paymentMethod) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Payment method is required",
        code: "MISSING_PAYMENT_METHOD",
      });
    }

    // Validate payment method format
    const validPaymentMethods = ['cod', 'card', 'upi', 'wallet'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid payment method",
        code: "INVALID_PAYMENT_METHOD",
      });
    }

    // Get user with cart
    const user = await User.findById(userId).populate("cart.product").session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    // Check email verification
    if (!user.isEmailVerified) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Please verify your email before placing an order",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    if (!user.cart || user.cart.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Cart is empty",
        code: "EMPTY_CART",
      });
    }

    // Fetch all products with a single query
    const productIds = user.cart.map((item) =>
      item.product?._id || item.product
    );
    const products = await Product.find({ _id: { $in: productIds } }).session(session);

    if (products.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "No valid products found in cart",
        code: "INVALID_CART_PRODUCTS",
      });
    }

    // ✅ CRITICAL: Validate payment method is allowed for ALL products
    const productsNotAllowingPayment = [];
    for (const product of products) {
      const allowedMethods = product.allowedPaymentMethods || ['cod', 'card', 'upi', 'wallet'];
      if (!allowedMethods.includes(paymentMethod)) {
        productsNotAllowingPayment.push(product.name);
      }
    }

    if (productsNotAllowingPayment.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: `Payment method '${paymentMethod}' is not available for: ${productsNotAllowingPayment.join(', ')}`,
        code: "PAYMENT_METHOD_NOT_ALLOWED",
        products: productsNotAllowingPayment,
        availablePaymentMethods: getCommonPaymentMethods(products)
      });
    }

    let subtotal = 0;
    const validatedItems = [];
    const productIDs = [];
    const productUpdateMap = new Map();

    // Validate cart items and update stock
    for (const cartItem of user.cart) {
      const productId = cartItem.product?._id || cartItem.product;
      const product = products.find((p) => p._id.equals(productId));

      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: `Product ${productId} not found`,
          code: "PRODUCT_NOT_FOUND",
        });
      }

      const variant = product.variants.id(cartItem.variant);
      if (!variant) {
        await session.abortTransaction();
        session.endSession();
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: `Variant not found for product ${product.name}`,
          code: "VARIANT_NOT_FOUND",
        });
      }

      const size = variant.sizes.id(cartItem.size);
      if (!size) {
        await session.abortTransaction();
        session.endSession();
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: `Size not found for product ${product.name}`,
          code: "SIZE_NOT_FOUND",
        });
      }

      const finalQuantity = quantities?.[cartItem._id.toString()] || cartItem.quantity;

      if (finalQuantity < 1) {
        await session.abortTransaction();
        session.endSession();
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: "Quantity must be at least 1",
          code: "INVALID_QUANTITY",
        });
      }

      if (size.stock < finalQuantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: `Insufficient stock for ${product.name} (${size.size}). Available: ${size.stock}, Requested: ${finalQuantity}`,
          code: "INSUFFICIENT_STOCK",
        });
      }

      // Store original stock for potential rollback
      if (!productUpdateMap.has(product._id.toString())) {
        productUpdateMap.set(product._id.toString(), {
          product,
          updates: []
        });
      }

      productUpdateMap.get(product._id.toString()).updates.push({
        variantId: cartItem.variant,
        sizeId: cartItem.size,
        quantity: finalQuantity,
        originalStock: size.stock
      });

      // Update stock
      size.stock -= finalQuantity;
      subtotal += size.price * finalQuantity;
      productIDs.push(productId);

      validatedItems.push({
        productId: productId,
        variantId: cartItem.variant,
        sizeId: cartItem.size,
        quantity: finalQuantity,
        unitPrice: size.price,
      });
    }

    // Save all product updates
    for (const productData of productUpdateMap.values()) {
      await productData.product.save({ session });
    }

    // Apply coupon if provided
    let discountAmount = 0;
    let appliedCoupon = null;

    if (couponCode && couponCode.trim()) {
      try {
        const couponResult = await Coupon.applyCoupon(
          couponCode.trim(),
          userId,
          null,
          subtotal,
          productIDs,
          user
        );

        if (!couponResult.isValid) {
          // Rollback stock changes
          for (const productData of productUpdateMap.values()) {
            const product = productData.product;
            for (const update of productData.updates) {
              const variant = product.variants.id(update.variantId);
              if (variant) {
                const size = variant.sizes.id(update.sizeId);
                if (size) {
                  size.stock = update.originalStock;
                }
              }
            }
            await product.save({ session });
          }

          await session.abortTransaction();
          session.endSession();
          return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: couponResult.message || "Invalid coupon code",
            code: "INVALID_COUPON",
          });
        }

        discountAmount = couponResult.discountAmount || 0;
        appliedCoupon = {
          code: couponResult.coupon.code,
          couponId: couponResult.coupon._id,
          discountAmount: discountAmount,
          type: couponResult.coupon.type,
        };
      } catch (couponError) {
        console.error("Coupon application error:", couponError);
        // Rollback stock changes
        for (const productData of productUpdateMap.values()) {
          const product = productData.product;
          for (const update of productData.updates) {
            const variant = product.variants.id(update.variantId);
            if (variant) {
              const size = variant.sizes.id(update.sizeId);
              if (size) {
                size.stock = update.originalStock;
              }
            }
          }
          await product.save({ session });
        }

        await session.abortTransaction();
        session.endSession();
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: couponError.message || "Failed to apply coupon",
          code: "COUPON_ERROR",
        });
      }
    }

    const finalAmount = Math.max(0, subtotal - discountAmount);

    // Create order
    const order = new Order({
      userId,
      items: validatedItems,
      subtotal,
      totalAmount: finalAmount,
      shippingAddress,
      status: "pending",
      paymentMethod,
      paymentStatus: "pending",
      coupon: appliedCoupon,
    });

    await order.save({ session });

    // Update coupon usage if applied
    if (couponCode && appliedCoupon) {
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase()
      }).session(session);

      if (coupon) {
        if (coupon.type === "universal") {
          const usage = await CouponUsage.findOneAndUpdate(
            { couponId: coupon._id, userId: userId, orderId: null },
            { orderId: order._id },
            { session, new: true }
          );

          if (!usage) {
            throw new Error("Coupon usage record not found");
          }

          await Coupon.findByIdAndUpdate(
            coupon._id,
            { $inc: { usageCount: 1 } },
            { session }
          );
        } else {
          const userCoupon = await UserCoupon.findOneAndUpdate(
            { userId: userId, couponId: coupon._id, orderId: null },
            { orderId: order._id, isUsed: true, usedAt: new Date() },
            { session, new: true }
          );

          if (!userCoupon) {
            throw new Error("User coupon record not found");
          }
        }
      }
    }

    // Clear cart and add order to user
    user.cart = [];
    user.orders.push(order._id);
    await user.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Emit socket event
    io.emit("orderCreated", order);

    res.status(httpStatus.CREATED).json({
      success: true,
      message: "Order created successfully",
      order,
      savings: discountAmount > 0 ? discountAmount : undefined,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    await session.abortTransaction();
    session.endSession();
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Internal server error",
      code: "INTERNAL_ERROR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Helper function to get common payment methods across all products
const getCommonPaymentMethods = (products) => {
  if (products.length === 0) return [];
  
  const allMethods = ['cod', 'card', 'upi', 'wallet'];
  return allMethods.filter(method => 
    products.every(product => {
      const allowedMethods = product.allowedPaymentMethods || ['cod', 'card', 'upi', 'wallet'];
      return allowedMethods.includes(method);
    })
  );
};

// GET ALL ORDERS (unchanged)
export const getAllOrders = async (req, res) => {
  try {
    const { userId } = req.query;
    const query = userId ? { userId } : {};

    const orders = await Order.find(query)
      .populate("userId", "username email")
      .populate("items.productId", "name")
      .sort({ createdAt: -1 })
      .lean();

    res.status(httpStatus.OK).json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};

// GET ORDER BY ID (unchanged)
export const getOrderById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "Invalid order ID",
      code: "INVALID_ID",
    });
  }

  try {
    const order = await Order.findById(id)
      .populate("userId", "username email")
      .populate("items.productId", "name")
      .lean();

    if (!order) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Order not found",
        code: "ORDER_NOT_FOUND",
      });
    }

    res.status(httpStatus.OK).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};

// DELETE ORDER (unchanged)
export const deleteOrder = async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    await session.abortTransaction();
    session.endSession();
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "Invalid order ID",
      code: "INVALID_ID",
    });
  }

  try {
    const order = await Order.findById(id).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Order not found",
        code: "ORDER_NOT_FOUND",
      });
    }

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

    // Reverse coupon usage
    if (order.coupon && order.coupon.code) {
      const coupon = await Coupon.findOne({
        code: order.coupon.code
      }).session(session);

      if (coupon) {
        if (coupon.type === "universal") {
          await CouponUsage.findOneAndDelete(
            { orderId: order._id },
            { session }
          );
          await Coupon.findByIdAndUpdate(
            coupon._id,
            { $inc: { usageCount: -1 } },
            { session }
          );
        } else {
          await UserCoupon.findOneAndUpdate(
            { orderId: order._id },
            { isUsed: false, usedAt: null, orderId: null },
            { session }
          );
        }
      }
    }

    // Remove order from user
    await User.updateOne(
      { _id: order.userId },
      { $pull: { orders: order._id } },
      { session }
    );

    // Delete order
    await Order.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    io.emit("orderDeleted", { id, deletedOrder: order });

    res.status(httpStatus.OK).json({
      success: true,
      message: "Order cancelled and stock restored successfully",
    });
  } catch (error) {
    console.error("Error deleting order:", error);
    await session.abortTransaction();
    session.endSession();
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      code: "INTERNAL_ERROR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// UPDATE ORDER STATUS (unchanged)
export const updateOrder = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "Valid status is required",
      code: "INVALID_STATUS",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(id)
      .populate("items.productId", "owner")
      .session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Order not found",
        code: "ORDER_NOT_FOUND",
      });
    }

    // Authorization: Admin OR Owner of ANY product in the order
    const isAdmin = req.userRole === "admin";
    const isProductOwner = order.items.some(item =>
      item.productId?.owner?.toString() === req.userId
    );

    if (!isAdmin && !isProductOwner) {
      await session.abortTransaction();
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "You are not authorized to update this order",
        code: "UNAUTHORIZED_UPDATE",
      });
    }

    // Prevent status downgrade
    const statusFlow = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    const currentIndex = statusFlow.indexOf(order.status);
    const newIndex = statusFlow.indexOf(status);
    if (newIndex < currentIndex && status !== 'cancelled') {
      await session.abortTransaction();
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Cannot downgrade order status",
        code: "INVALID_STATUS_FLOW",
      });
    }

    order.status = status;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    const populatedOrder = await Order.findById(id)
      .populate("userId", "username email")
      .populate("items.productId", "name")
      .lean();

    io.emit("orderUpdated", populatedOrder);

    res.status(httpStatus.OK).json({
      success: true,
      message: "Order status updated successfully",
      order: populatedOrder,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating order:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to update order",
      code: "UPDATE_FAILED",
    });
  }
};

export const getDashboardOrders = async (req, res) => {
  try {
    const userRole = req.userRole;
    const userId = req.userId;
    const { page = 1, limit = 10, status, sortBy = 'createdAt', order = 'desc' } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    if (userRole === 'admin') {
      if (status) {
        query.status = status;
      }
    } else if (userRole === "owner") {
      const ownerProducts = await Product.find({ owner: userId }).select('_id').lean();
      const ownerProductIds = ownerProducts.map(p => p._id);

      query['items.productId'] = { $in: ownerProductIds };

      if (status) {
        query.status = status;
      }
    } else {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Access denied. Only admins and owners can access dashboard.",
        code: "INSUFFICIENT_PERMISSIONS",
      });
    }

    const sortOptions = {};
    sortOptions[sortBy] = order === 'asc' ? 1 : -1;

    const [orders, totalCount] = await Promise.all([
      Order.find(query)
        .populate("userId", "username email")
        .populate("items.productId", "name owner")
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(query)
    ]);

    const stats = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          totalOrders: { $sum: 1 },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
          },
          processingOrders: {
            $sum: { $cond: [{ $eq: ["$status", "processing"] }, 1, 0] }
          },
          shippedOrders: {
            $sum: { $cond: [{ $eq: ["$status", "shipped"] }, 1, 0] }
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
          }
        }
      }
    ]);

    res.status(httpStatus.OK).json({
      success: true,
      orders,
      pagination: {
        totalCount,
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        limit: limitNum,
        hasNext: pageNum * limitNum < totalCount,
        hasPrevious: pageNum > 1
      },
      statistics: stats.length > 0 ? stats[0] : {
        totalRevenue: 0,
        totalOrders: 0,
        pendingOrders: 0,
        processingOrders: 0,
        shippedOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0
      },
      role: userRole
    });

  } catch (error) {
    console.error("Error fetching dashboard orders:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    })
  }
}

