import mongoose from "mongoose";
import User from "../models/user.model.js";
import httpStatus from "http-status";
import Product from "../models/product.model.js"

// ✅ Helper function to check email verification
const checkEmailVerification = (user, res) => {
  if (!user.isEmailVerified) {
    return res.status(httpStatus.FORBIDDEN).json({
      success: false,
      message: "Please verify your email to use this feature",
      requiresVerification: true
    });
  }
  return null;
};

export const wishlistAdd = async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "Invalid product ID format"
        });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "User not found"
            });
        }

        // ✅ Check email verification
        const verificationCheck = checkEmailVerification(user, res);
        if (verificationCheck) return verificationCheck;

        // ✅ Verify product exists
        const product = await Product.findById(id);
        if (!product) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "Product not found"
            });
        }

        if (user.wishlist.some(item => item.toString() === id)) {
            return res.status(httpStatus.CONFLICT).json({
                success: false,
                message: "Product already in wishlist"
            });
        }

        user.wishlist.push(new mongoose.Types.ObjectId(id));
        await user.save();

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Product added to wishlist"
        });
    } catch (error) {
        console.error("Wishlist add error:", error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || "Failed to add to wishlist"
        });
    }
};

export const wishlistRemove = async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    console.log('Wishlist Remove - ProductId:', id, 'UserId:', userId);

    if (!userId) {
        return res.status(httpStatus.UNAUTHORIZED).json({
            success: false,
            message: "Authentication required"
        });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found with ID:', userId);
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "User not found"
            });
        }

        // ✅ Check email verification
        const verificationCheck = checkEmailVerification(user, res);
        if (verificationCheck) return verificationCheck;

        if (!user.wishlist.includes(id)) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "Product not found in wishlist"
            });
        }

        user.wishlist = user.wishlist.filter(item => item.toString() !== id);
        await user.save();

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Product removed from wishlist"
        });
    } catch (error) {
        console.error('Wishlist remove error:', error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || "Failed to remove from wishlist"
        });
    }
}

export const wishlistShow = async (req, res) => {
    const userId = req.userId;

    if (!userId) {
        return res.status(httpStatus.UNAUTHORIZED).json({
            success: false,
            message: "Authentication required"
        });
    }

    try {
        const user = await User.findById(userId).populate({
            path: 'wishlist',
            select: 'name description category variants'
        });
        
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "User not found"
            });
        }

        // ✅ Check email verification
        const verificationCheck = checkEmailVerification(user, res);
        if (verificationCheck) return verificationCheck;

        // Transform wishlist items to include base price and images
        const enrichedWishlist = user.wishlist.map((product) => {
            const firstVariant = product.variants?.[0];
            const firstSize = firstVariant?.sizes?.[0];
            
            return {
                _id: product._id,
                name: product.name,
                description: product.description,
                category: product.category,
                price: firstSize?.price || 0,
                images: firstVariant?.images || [],
                stock: firstSize?.stock || 0
            };
        });

        return res.status(httpStatus.OK).json({
            success: true,
            wishlist: enrichedWishlist
        });
    } catch (error) {
        console.error('Wishlist show error:', error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || "Failed to fetch wishlist"
        });
    }
};

export const cartAdd = async (req, res) => {
    const { productId, variantId, sizeId, quantity = 1 } = req.body;
    const userId = req.userId;

    console.log('Cart Add - Request:', { productId, variantId, sizeId, quantity, userId });

    if (!userId) {
        return res.status(httpStatus.UNAUTHORIZED).json({
            success: false,
            message: "Authentication required"
        });
    }

    // Validate required fields
    if (!productId) {
        return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "Product ID is required"
        });
    }

    // Check if productId is valid
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "Invalid product ID format"
        });
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "User not found"
            });
        }

        // ✅ Check email verification
        const verificationCheck = checkEmailVerification(user, res);
        if (verificationCheck) return verificationCheck;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "Product not found"
            });
        }

        // Check if product has variants
        if (!product.variants || product.variants.length === 0) {
            return res.status(httpStatus.BAD_REQUEST).json({
                success: false,
                message: "Product has no variants available"
            });
        }

        let variant, size;

        // Handle single variant case
        if (product.variants.length === 1 && !variantId) {
            variant = product.variants[0];
        } else {
            // Validate variantId for multi-variant products
            if (!variantId || !mongoose.Types.ObjectId.isValid(variantId)) {
                return res.status(httpStatus.BAD_REQUEST).json({
                    success: false,
                    message: "Valid variant ID is required"
                });
            }
            variant = product.variants.find(v => v._id.toString() === variantId);
        }

        if (!variant) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "Variant not found"
            });
        }

        // Check if variant has sizes
        if (!variant.sizes || variant.sizes.length === 0) {
            return res.status(httpStatus.BAD_REQUEST).json({
                success: false,
                message: "Variant has no sizes available"
            });
        }

        // Handle single size case
        if (variant.sizes.length === 1 && !sizeId) {
            size = variant.sizes[0];
        } else {
            // Validate sizeId for multi-size variants
            if (!sizeId || !mongoose.Types.ObjectId.isValid(sizeId)) {
                return res.status(httpStatus.BAD_REQUEST).json({
                    success: false,
                    message: "Valid size ID is required"
                });
            }
            size = variant.sizes.find(s => s._id.toString() === sizeId);
        }

        if (!size) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "Size not found"
            });
        }

        // Check stock
        if (size.stock < qty) {
            return res.status(httpStatus.CONFLICT).json({
                success: false,
                message: `Only ${size.stock} items available in stock`
            });
        }

        // Try to find existing identical item
        const existingIndex = user.cart.findIndex(item =>
            item.product.toString() === productId.toString() &&
            item.variant.toString() === variant._id.toString() &&
            item.size.toString() === size._id.toString()
        );

        if (existingIndex > -1) {
            // Increment quantity (respect stock)
            const newQty = user.cart[existingIndex].quantity + qty;
            if (newQty > size.stock) {
                return res.status(httpStatus.CONFLICT).json({ 
                    success: false, 
                    message: `Cannot add ${qty}. Max available: ${size.stock - user.cart[existingIndex].quantity}` 
                });
            }
            user.cart[existingIndex].quantity = newQty;
        } else {
            // Push new item (snapshot price)
            user.cart.push({
                product: product._id,
                variant: variant._id,
                size: size._id,
                quantity: qty,
                unitPrice: size.price || 0
            });
        }

        await user.save();

        console.log('Cart item added successfully');

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Product added to cart"
        });
    } catch (error) {
        console.error('Cart add error:', error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || "Failed to add to cart"
        });
    }
};

export const cartUpdateQuantity = async (req, res) => {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
        return res.status(httpStatus.BAD_REQUEST).json({ 
            success: false, 
            message: "Invalid item ID" 
        });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        // ✅ Check email verification
        const verificationCheck = checkEmailVerification(user, res);
        if (verificationCheck) return verificationCheck;

        const item = user.cart.id(itemId);
        if (!item) {
            return res.status(httpStatus.NOT_FOUND).json({ 
                success: false, 
                message: "Cart item not found" 
            });
        }

        // Get product -> variant -> size to check stock
        const product = await Product.findById(item.product).lean();
        if (!product) {
            return res.status(httpStatus.NOT_FOUND).json({ 
                success: false, 
                message: "Product not found" 
            });
        }

        const variant = (product.variants || []).find(v => v._id.toString() === item.variant.toString());
        if (!variant) {
            return res.status(httpStatus.NOT_FOUND).json({ 
                success: false, 
                message: "Variant not found" 
            });
        }

        const size = (variant.sizes || []).find(s => s._id.toString() === item.size.toString());
        if (!size) {
            return res.status(httpStatus.NOT_FOUND).json({ 
                success: false, 
                message: "Size not found" 
            });
        }

        const qty = Math.max(1, parseInt(quantity, 10));
        if (qty > size.stock) {
            return res.status(httpStatus.CONFLICT).json({ 
                success: false, 
                message: `Only ${size.stock} available` 
            });
        }

        item.quantity = qty;
        await user.save();

        return res.status(httpStatus.OK).json({ 
            success: true, 
            message: "Cart quantity updated successfully",
            cart: user.cart 
        });
    } catch (err) {
        console.error('Cart update error:', err);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: err.message || "Failed to update cart"
        });
    }
};

export const cartRemove = async (req, res) => {
    const { itemId } = req.params;
    const userId = req.userId;

    console.log('Cart Remove - ItemId:', itemId, 'UserId:', userId);

    if (!userId) {
        return res.status(httpStatus.UNAUTHORIZED).json({
            success: false,
            message: "Authentication required"
        });
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
        return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "Invalid item ID format"
        });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found with ID:', userId);
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "User not found"
            });
        }

        // ✅ Check email verification
        const verificationCheck = checkEmailVerification(user, res);
        if (verificationCheck) return verificationCheck;

        const item = user.cart.id(itemId);
        if (!item) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "Product not found in cart"
            });
        }
        
        // Use pull method instead of remove() for better compatibility
        user.cart.pull({ _id: itemId });
        await user.save();

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Product removed from cart"
        });
    } catch (error) {
        console.error('Cart remove error:', error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || "Failed to remove from cart"
        });
    }
}

export const cartShow = async (req, res) => {
    const userId = req.userId;
    
    if (!userId) {
        return res.status(httpStatus.UNAUTHORIZED).json({
            success: false,
            message: "Authentication required"
        });
    }

    try {
        const user = await User.findById(userId).populate({
            path: 'cart.product',
            select: 'name description category variants'
        });
        
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "User not found"
            });
        }

        // ✅ Check email verification
        const verificationCheck = checkEmailVerification(user, res);
        if (verificationCheck) return verificationCheck;
        
        const enriched = user.cart.map(item => {
            const product = item.product;
            const variant = (product?.variants || []).find(v => v._id.toString() === item.variant.toString());
            const size = (variant?.sizes || []).find(s => s._id.toString() === item.size.toString());

            return {
                _id: item._id,
                product: {
                    _id: product?._id,
                    name: product?.name,
                    images: variant?.images || []
                },
                variant: {
                    _id: variant?._id,
                    name: variant?.color,
                    color: variant?.color
                },
                size: {
                    _id: size?._id,
                    name: size?.size,
                    size: size?.size,
                    price: size?.price,
                    stock: size?.stock
                },
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.unitPrice * item.quantity
            };
        });
        
        return res.status(httpStatus.OK).json({
            success: true,
            cart: enriched
        });
    } catch (err) {
        console.error('Cart show error:', err);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: err.message || "Failed to fetch cart"
        });
    }
};

export const cartClear = async (req, res) => {
    const userId = req.userId;

    if (!userId) {
        return res.status(httpStatus.UNAUTHORIZED).json({
            success: false,
            message: "Authentication required"
        });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({
                success: false,
                message: "User not found"
            });
        }

        // ✅ Check email verification
        const verificationCheck = checkEmailVerification(user, res);
        if (verificationCheck) return verificationCheck;

        if (user.cart.length === 0) {
            return res.status(httpStatus.CONFLICT).json({
                success: false,
                message: "Cart is already empty"
            });
        }

        user.cart = [];
        await user.save();

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Cart cleared successfully"
        });
    } catch (error) {
        console.error('Cart clear error:', error);
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || "Failed to clear cart"
        });
    }
}