import mongoose from "mongoose";
import httpStatus from "http-status";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import { io } from "../app.js";
import { Coupon, UserCoupon, CouponUsage } from "../models/coupon.model.js";

export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { shippingAddress, quantities, paymentMethod, couponCode } = req.body;
    const userId = req.userId;

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

    const productIds = user.cart.map((item) => item.product?._id || item.product);
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

    for (const productData of productUpdateMap.values()) {
      await productData.product.save({ session });
    }

    let discountAmount = 0;
    let appliedCoupon = null;

    if (couponCode && couponCode.trim()) {
      try {
        const userForCoupon = await User.findById(userId)
          .select('createdAt accountCreatedAt')
          .session(session)
          .lean();

        const couponResult = await Coupon.applyCoupon(
          couponCode.trim(),
          userId,
          null,
          subtotal,
          productIDs,
          userForCoupon
        );

        if (!couponResult.isValid) {
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

    user.cart = [];
    user.orders.push(order._id);
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

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

    await User.updateOne(
      { _id: order.userId },
      { $pull: { orders: order._id } },
      { session }
    );

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

    let matchQuery = {};
    let ownerProductIds = [];

    if (userRole === 'admin') {
      if (status) {
        matchQuery.status = status;
      }
    } else if (userRole === "owner") {
      const ownerProducts = await Product.find({ owner: userId }).select('_id').lean();
      ownerProductIds = ownerProducts.map(p => p._id);

      // Only show orders that contain at least one of owner's products
      matchQuery['items.productId'] = { $in: ownerProductIds };

      if (status) {
        matchQuery.status = status;
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

    // Fetch orders with proper filtering
    const [allOrders, totalCount] = await Promise.all([
      Order.find(matchQuery)
        .populate("userId", "username email")
        .populate("items.productId", "name owner")
        .sort(sortOptions)
        .lean(),
      Order.countDocuments(matchQuery)
    ]);

    // For owners, filter to show only their products in each order
    let filteredOrders = allOrders;
    
    if (userRole === 'owner') {
      filteredOrders = allOrders.map(order => {
        // Filter items to show only owner's products
        const ownerItems = order.items.filter(item => 
          ownerProductIds.some(pid => pid.toString() === item.productId._id.toString())
        );
        
        return {
          ...order,
          items: ownerItems,
          // Show full order details but mark it as partial if there are other items
          isPartialOrder: ownerItems.length < order.items.length,
          totalItemsInOrder: order.items.length
        };
      });
    }

    // Apply pagination to filtered results
    const paginatedOrders = filteredOrders.slice(skip, skip + limitNum);

    // Calculate statistics based on role
    let stats;
    
    if (userRole === 'admin') {
      // Admin: Calculate from ALL orders
      stats = await Order.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            // Only count revenue from delivered orders
            totalRevenue: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "delivered"] },
                  "$totalAmount",
                  0
                ]
              }
            },
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
    } else {
      // Owner: Calculate revenue only from their products
      const ownerOrders = await Order.find({
        'items.productId': { $in: ownerProductIds }
      }).lean();

      let totalRevenue = 0;
      let totalOrders = ownerOrders.length;
      let pendingOrders = 0;
      let processingOrders = 0;
      let shippedOrders = 0;
      let deliveredOrders = 0;
      let cancelledOrders = 0;

      ownerOrders.forEach(order => {
        // Calculate revenue from owner's products in delivered orders only
        if (order.status === 'delivered') {
          const ownerItemsSubtotal = order.items
            .filter(item => ownerProductIds.some(pid => pid.toString() === item.productId.toString()))
            .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
          
          // Apply proportional discount if coupon was used
          if (order.coupon && order.coupon.discountAmount > 0 && order.subtotal > 0) {
            const discountRatio = order.coupon.discountAmount / order.subtotal;
            const ownerDiscount = ownerItemsSubtotal * discountRatio;
            totalRevenue += (ownerItemsSubtotal - ownerDiscount);
          } else {
            totalRevenue += ownerItemsSubtotal;
          }
        }

        // Count orders by status
        if (order.status === 'pending') pendingOrders++;
        if (order.status === 'processing') processingOrders++;
        if (order.status === 'shipped') shippedOrders++;
        if (order.status === 'delivered') deliveredOrders++;
        if (order.status === 'cancelled') cancelledOrders++;
      });

      stats = [{
        _id: null,
        totalRevenue: Math.round(totalRevenue),
        totalOrders,
        pendingOrders,
        processingOrders,
        shippedOrders,
        deliveredOrders,
        cancelledOrders
      }];
    }

    res.status(httpStatus.OK).json({
      success: true,
      orders: paginatedOrders,
      pagination: {
        totalCount,
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        limit: limitNum,
        hasNext: pageNum * limitNum < totalCount,
        hasPrevious: pageNum > 1
      },
      statistics: stats && stats.length > 0 ? stats[0] : {
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
    });
  }
};

export const getOwnerAnalytics = async (req, res) => {
  try {
    const userRole = req.userRole;

    // Only admins can access this endpoint
    if (userRole !== 'admin') {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Access denied. Admin only.",
        code: "INSUFFICIENT_PERMISSIONS",
      });
    }

    // Get all owners
    const owners = await User.find({ role: 'owner' })
      .select('username email accountCreatedAt isApproved')
      .lean();

    // Fetch analytics for each owner
    const ownerAnalytics = await Promise.all(
      owners.map(async (owner) => {
        // Get owner's products
        const products = await Product.find({ owner: owner._id })
          .select('name category')
          .lean();

        const productIds = products.map(p => p._id);

        // Get all orders containing owner's products
        const orders = await Order.find({
          'items.productId': { $in: productIds }
        }).lean();

        // Calculate revenue and order statistics
        let totalRevenue = 0;
        let orderStats = {
          pending: 0,
          processing: 0,
          shipped: 0,
          delivered: 0,
          cancelled: 0
        };

        orders.forEach(order => {
          // Count order by status
          if (orderStats.hasOwnProperty(order.status)) {
            orderStats[order.status]++;
          }

          // Calculate revenue only from delivered orders
          if (order.status === 'delivered') {
            // Calculate owner's portion of the order
            const ownerItemsSubtotal = order.items
              .filter(item => productIds.some(pid => pid.toString() === item.productId.toString()))
              .reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

            // Apply proportional discount if coupon was used
            if (order.coupon && order.coupon.discountAmount > 0 && order.subtotal > 0) {
              const discountRatio = order.coupon.discountAmount / order.subtotal;
              const ownerDiscount = ownerItemsSubtotal * discountRatio;
              totalRevenue += (ownerItemsSubtotal - ownerDiscount);
            } else {
              totalRevenue += ownerItemsSubtotal;
            }
          }
        });

        return {
          _id: owner._id,
          username: owner.username,
          email: owner.email,
          accountCreatedAt: owner.accountCreatedAt,
          isApproved: owner.isApproved,
          totalProducts: products.length,
          totalOrders: orders.length,
          totalRevenue: Math.round(totalRevenue),
          orderStats,
          products: products.map(p => ({
            _id: p._id,
            name: p.name,
            category: p.category
          }))
        };
      })
    );

    // Sort by revenue (highest first)
    ownerAnalytics.sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.status(httpStatus.OK).json({
      success: true,
      owners: ownerAnalytics,
      summary: {
        totalOwners: ownerAnalytics.length,
        totalRevenue: ownerAnalytics.reduce((sum, o) => sum + o.totalRevenue, 0),
        totalProducts: ownerAnalytics.reduce((sum, o) => sum + o.totalProducts, 0),
        totalOrders: ownerAnalytics.reduce((sum, o) => sum + o.totalOrders, 0)
      }
    });

  } catch (error) {
    console.error("Error fetching owner analytics:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};


export const getOwnerAnalyticsDetailed = async (req, res) => {
  try {
    const userRole = req.userRole;
    const userId = req.userId;

    // Only owners can access this endpoint
    if (userRole !== 'owner') {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Access denied. Owners only.",
        code: "INSUFFICIENT_PERMISSIONS",
      });
    }

    // Get owner's products
    const products = await Product.find({ owner: userId })
      .select('name category')
      .lean();

    const productIds = products.map(p => p._id);

    // Get all orders containing owner's products
    const orders = await Order.find({
      'items.productId': { $in: productIds }
    })
    .populate('userId', 'username email')
    .lean();

    // Initialize analytics object
    let analytics = {
      totalRevenue: 0,
      deliveredRevenue: 0,
      pendingRevenue: 0,
      cancelledRevenue: 0,
      totalOrders: orders.length,
      totalProducts: products.length,
      averageOrderValue: 0,
      pendingOrders: 0,
      processingOrders: 0,
      shippedOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      topProducts: [],
      recentOrders: [],
      monthlyData: []
    };

    // Track product performance
    const productPerformance = new Map();
    const monthlyRevenue = new Map();

    orders.forEach(order => {
      // Calculate owner's portion of each order
      const ownerItems = order.items.filter(item => 
        productIds.some(pid => pid.toString() === item.productId.toString())
      );

      const ownerItemsSubtotal = ownerItems.reduce((sum, item) => 
        sum + (item.unitPrice * item.quantity), 0
      );

      // Apply proportional discount if coupon was used
      let ownerRevenue = ownerItemsSubtotal;
      if (order.coupon && order.coupon.discountAmount > 0 && order.subtotal > 0) {
        const discountRatio = order.coupon.discountAmount / order.subtotal;
        const ownerDiscount = ownerItemsSubtotal * discountRatio;
        ownerRevenue = ownerItemsSubtotal - ownerDiscount;
      }

      // Count orders by status
      if (order.status === 'pending') analytics.pendingOrders++;
      if (order.status === 'processing') analytics.processingOrders++;
      if (order.status === 'shipped') analytics.shippedOrders++;
      if (order.status === 'delivered') analytics.deliveredOrders++;
      if (order.status === 'cancelled') analytics.cancelledOrders++;

      // Revenue by status
      if (order.status === 'delivered') {
        analytics.deliveredRevenue += ownerRevenue;
        analytics.totalRevenue += ownerRevenue;
      } else if (order.status === 'cancelled') {
        analytics.cancelledRevenue += ownerRevenue;
      } else {
        analytics.pendingRevenue += ownerRevenue;
      }

      // Track product performance
      ownerItems.forEach(item => {
        const productId = item.productId.toString();
        if (!productPerformance.has(productId)) {
          const productInfo = products.find(p => p._id.toString() === productId);
          productPerformance.set(productId, {
            _id: productId,
            name: productInfo?.name || 'Unknown Product',
            category: productInfo?.category || 'Unknown',
            revenue: 0,
            orderCount: 0
          });
        }
        const perf = productPerformance.get(productId);
        if (order.status === 'delivered') {
          const itemRevenue = item.unitPrice * item.quantity;
          // Apply proportional discount
          if (order.coupon && order.coupon.discountAmount > 0 && order.subtotal > 0) {
            const discountRatio = order.coupon.discountAmount / order.subtotal;
            perf.revenue += itemRevenue - (itemRevenue * discountRatio);
          } else {
            perf.revenue += itemRevenue;
          }
          perf.orderCount++;
        }
      });

      // Monthly data
      const monthYear = new Date(order.createdAt).toLocaleDateString('en-IN', { 
        year: 'numeric', 
        month: 'short' 
      });
      if (!monthlyRevenue.has(monthYear)) {
        monthlyRevenue.set(monthYear, { revenue: 0, orders: 0 });
      }
      if (order.status === 'delivered') {
        const monthly = monthlyRevenue.get(monthYear);
        monthly.revenue += ownerRevenue;
        monthly.orders++;
      }
    });

    // Calculate average order value
    analytics.averageOrderValue = analytics.deliveredOrders > 0 
      ? Math.round(analytics.deliveredRevenue / analytics.deliveredOrders)
      : 0;

    // Round revenue values
    analytics.totalRevenue = Math.round(analytics.totalRevenue);
    analytics.deliveredRevenue = Math.round(analytics.deliveredRevenue);
    analytics.pendingRevenue = Math.round(analytics.pendingRevenue);
    analytics.cancelledRevenue = Math.round(analytics.cancelledRevenue);

    // Top performing products (top 5)
    analytics.topProducts = Array.from(productPerformance.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(p => ({
        ...p,
        revenue: Math.round(p.revenue)
      }));

    // Recent orders (last 10)
    analytics.recentOrders = orders
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10)
      .map(order => {
        const ownerItems = order.items.filter(item => 
          productIds.some(pid => pid.toString() === item.productId.toString())
        );
        
        const ownerItemsSubtotal = ownerItems.reduce((sum, item) => 
          sum + (item.unitPrice * item.quantity), 0
        );

        let ownerRevenue = ownerItemsSubtotal;
        if (order.coupon && order.coupon.discountAmount > 0 && order.subtotal > 0) {
          const discountRatio = order.coupon.discountAmount / order.subtotal;
          ownerRevenue = ownerItemsSubtotal - (ownerItemsSubtotal * discountRatio);
        }

        return {
          _id: order._id,
          createdAt: order.createdAt,
          status: order.status,
          itemCount: ownerItems.length,
          ownerRevenue: Math.round(ownerRevenue)
        };
      });

    // Monthly data (last 6 months)
    analytics.monthlyData = Array.from(monthlyRevenue.entries())
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .slice(0, 6)
      .map(([month, data]) => ({
        month,
        revenue: Math.round(data.revenue),
        orders: data.orders
      }))
      .reverse();

    res.status(httpStatus.OK).json({
      success: true,
      ...analytics
    });

  } catch (error) {
    console.error("Error fetching owner analytics:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};