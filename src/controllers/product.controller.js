import Product from "../models/product.model.js";
import Review from "../models/review.model.js";
import httpStatus from "http-status";
import { uploadMultipleToCloudinary, deleteMultipleFromCloudinary } from "./upload.controller.js";

// Simple in-memory cache for search results
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Request deduplication map
const pendingRequests = new Map();

export const ownerProduct = async (req, res) => {
  try {
    const userRole = req.userRole;
    if (userRole !== "admin" && userRole !== "owner") {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Only owners and admins can access their products."
      });
    };

    const ownerId = req.userId;
    const products = await Product.find({ owner: ownerId })
      .select('-__v')
      .lean();
    res.status(httpStatus.OK).json({
      success: true,
      products,
      count: products.length
    });

  } catch (error) {
    console.error("Error fetching owner's products:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
}

export const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(httpStatus.BAD_REQUEST).json({
        message: "Invalid pagination parameters",
        success: false
      });
    }

    const skip = (page - 1) * limit;
    const cacheKey = `products_page_${page}_limit_${limit}`;

    if (pendingRequests.has(cacheKey)) {
      console.log(`Deduplicating request for ${cacheKey}`);
      return pendingRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
      try {
        const [products, totalCount] = await Promise.all([
          Product.find()
            .select('-__v')
            .skip(skip)
            .limit(limit)
            .lean(),
          Product.countDocuments()
        ]);

        const response = {
          success: true,
          products,
          totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrevious: page > 1
        };

        res.status(httpStatus.OK).json(response);
        return response;
      } finally {
        pendingRequests.delete(cacheKey);
      }
    })();

    pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;

  } catch (error) {
    console.error("Error fetching products:", error.message);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .select('-__v')
      .limit(1000)
      .lean();

    res.status(httpStatus.OK).json({
      success: true,
      products,
      count: products.length
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const getProductById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "Product ID is required"
    });
  }

  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "Invalid product ID format"
    });
  }

  try {
    const product = await Product.findById(id)
      .select('-__v')
      .lean();

    if (!product) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Product not found"
      });
    }

    res.status(httpStatus.OK).json({
      success: true,
      ...product
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const createProduct = async (req, res) => {
  let owner = req.userId;
  try {
    let ownerRole = req.userRole;
    if (ownerRole !== "admin" && ownerRole !== "owner") {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "Only owners and admins can create products."
      });
    }

    console.log("=== CREATE PRODUCT REQUEST ===");
    console.log("Body:", {
      name: req.body.name,
      category: req.body.category,
      variantsLength: req.body.variants?.length,
      allowedPaymentMethods: req.body.allowedPaymentMethods
    });
    console.log("Files received:", req.files?.length || 0);

    if (req.files) {
      const filesByField = {};
      req.files.forEach(f => {
        if (!filesByField[f.fieldname]) filesByField[f.fieldname] = [];
        filesByField[f.fieldname].push(f.originalname);
      });
      console.log("Files grouped by fieldname:", filesByField);
    }

    const { name, description, category, variants, allowedPaymentMethods } = req.body;

    if (!name || !description || !category) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Name, description, and category are required."
      });
    }

    // Validate allowedPaymentMethods
    let parsedPaymentMethods = ['cod', 'card', 'upi', 'wallet']; // default
    if (allowedPaymentMethods) {
      try {
        parsedPaymentMethods = typeof allowedPaymentMethods === "string"
          ? JSON.parse(allowedPaymentMethods)
          : allowedPaymentMethods;

        if (!Array.isArray(parsedPaymentMethods) || parsedPaymentMethods.length === 0) {
          return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "At least one payment method must be allowed."
          });
        }

        const validMethods = ['cod', 'card', 'upi', 'wallet'];
        const invalidMethods = parsedPaymentMethods.filter(m => !validMethods.includes(m));
        if (invalidMethods.length > 0) {
          return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: `Invalid payment methods: ${invalidMethods.join(', ')}`
          });
        }
      } catch (parseError) {
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: "Invalid allowedPaymentMethods format. Must be valid JSON array."
        });
      }
    }

    let parsedVariants;
    try {
      parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;
    } catch (parseError) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid variants format. Must be valid JSON."
      });
    }

    if (!Array.isArray(parsedVariants) || parsedVariants.length === 0) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "At least one variant is required."
      });
    }

    const processedVariants = await Promise.all(parsedVariants.map(async (variant, index) => {
      const expectedFieldname = `variant_${index}_images`;
      const variantFiles = req.files?.filter(file => file.fieldname === expectedFieldname) || [];

      console.log(`\nProcessing Variant ${index}:`);
      console.log(`  Color: ${variant.color}`);
      console.log(`  Expected fieldname: ${expectedFieldname}`);
      console.log(`  Files found: ${variantFiles.length}`);

      if (variantFiles.length === 0) {
        const availableFieldnames = req.files?.map(f => f.fieldname).join(', ') || 'none';
        throw new Error(
          `No images found for variant ${index + 1} (${variant.color}). ` +
          `Expected: "${expectedFieldname}". ` +
          `Available: ${availableFieldnames}`
        );
      }

      variantFiles.forEach((file, idx) => {
        console.log(`  Image ${idx + 1}: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`Image "${file.originalname}" exceeds 10MB limit`);
        }
      });

      console.log(`  Uploading ${variantFiles.length} images to Cloudinary...`);
      const imageUrls = await uploadMultipleToCloudinary(variantFiles);
      console.log(`  ✓ Successfully uploaded ${imageUrls.length} images`);

      const images = imageUrls.map(img => ({
        url: img.url,
        publicId: img.public_id || img.publicId,
        type: img.type || 'image'
      }));

      return {
        color: variant.color,
        sizes: variant.sizes,
        images
      };
    }));

    const productData = {
      name,
      description,
      category,
      variants: processedVariants,
      owner,
      allowedPaymentMethods: parsedPaymentMethods
    };

    const newProduct = new Product(productData);
    await newProduct.save();

    // Clear search cache
    searchCache.clear();

    console.log("✓ Product created successfully:", newProduct._id);

    req.io.emit("product:created", newProduct);

    res.status(httpStatus.CREATED).json({
      success: true,
      message: "Product created successfully",
      product: newProduct
    });

  } catch (error) {
    console.error("=== ERROR CREATING PRODUCT ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Internal server error"
    });
  }
};

export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const owner = req.userId;
  const ownerRole = req.userRole;

  if (!owner || (ownerRole !== "admin" && ownerRole !== "owner")) {
    return res.status(httpStatus.FORBIDDEN).json({
      success: false,
      message: "Only owners and admins can update products."
    });
  }

  try {
    let { name, description, category, variants, allowedPaymentMethods } = req.body;
    const parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;

    if (!name || !description || !category || !Array.isArray(parsedVariants) || parsedVariants.length === 0) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "All fields and at least one variant are required."
      });
    }

    // Validate allowedPaymentMethods if provided
    let parsedPaymentMethods;
    if (allowedPaymentMethods) {
      try {
        parsedPaymentMethods = typeof allowedPaymentMethods === "string"
          ? JSON.parse(allowedPaymentMethods)
          : allowedPaymentMethods;

        if (!Array.isArray(parsedPaymentMethods) || parsedPaymentMethods.length === 0) {
          return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: "At least one payment method must be allowed."
          });
        }

        const validMethods = ['cod', 'card', 'upi', 'wallet'];
        const invalidMethods = parsedPaymentMethods.filter(m => !validMethods.includes(m));
        if (invalidMethods.length > 0) {
          return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: `Invalid payment methods: ${invalidMethods.join(', ')}`
          });
        }
      } catch (parseError) {
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: "Invalid allowedPaymentMethods format. Must be valid JSON array."
        });
      }
    }

    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Product not found"
      });
    }

    if (existingProduct.owner.toString() !== owner && ownerRole !== "admin") {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "You do not have permission to update this product."
      });
    }

    const processedVariants = await Promise.all(parsedVariants.map(async (variant, index) => {
      const variantFiles = req.files?.filter(file => file.fieldname === `variant_${index}_images`) || [];
      let images;

      if (variantFiles.length > 0) {
        const oldVariant = existingProduct.variants[index];
        if (oldVariant?.images) {
          await deleteMultipleFromCloudinary(oldVariant.images.map(img => img.publicId));
        }

        const imageUrls = await uploadMultipleToCloudinary(variantFiles);
        images = imageUrls.map(img => ({
          url: img.url,
          publicId: img.public_id || img.publicId,
          type: img.type || 'image'
        }));
      } else {
        images = existingProduct.variants[index]?.images || [];
      }

      return { color: variant.color, sizes: variant.sizes, images };
    }));

    const updateData = {
      name,
      description,
      category,
      variants: processedVariants
    };

    // Only update allowedPaymentMethods if provided
    if (parsedPaymentMethods) {
      updateData.allowedPaymentMethods = parsedPaymentMethods;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    searchCache.clear();

    req.io.emit("product:updated", updatedProduct);
    res.status(httpStatus.OK).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const deleteProduct = async (req, res) => {
  const { id } = req.params;
  const owner = req.userId;
  const ownerRole = req.userRole;

  try {
    const product = await Product.findById(id);
    if (!product) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Product not found"
      });
    }

    if (product.owner.toString() !== owner && ownerRole !== "admin") {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: "You do not have permission to delete this product."
      });
    }

    const allImages = product.variants.flatMap(variant => variant.images);
    if (allImages.length > 0) {
      await deleteMultipleFromCloudinary(allImages.map(img => img.publicId));
    }

    const reviews = await Review.find({ productId: id });
    const reviewMediaIds = reviews.flatMap(r => r.media.map(m => m.publicId));
    if (reviewMediaIds.length > 0) {
      await deleteMultipleFromCloudinary(reviewMediaIds);
    }

    await Review.deleteMany({ productId: id });
    await Product.findByIdAndDelete(id);

    searchCache.clear();

    req.io.emit("product:deleted", id);
    res.status(httpStatus.OK).json({
      success: true,
      message: "Product and all related reviews deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const getProductBySearch = async (req, res) => {
  try {
    let { q, category, fuzzy } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 1) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Valid search query is required"
      });
    }

    const query = q.trim();
    const enableFuzzy = fuzzy === 'true';
    const cacheKey = `search_${query}_${category || 'all'}_${enableFuzzy}`;

    // Check cache
    if (searchCache.has(cacheKey)) {
      const cachedData = searchCache.get(cacheKey);
      if (Date.now() - cachedData.timestamp < CACHE_TTL) {
        return res.status(httpStatus.OK).json({
          success: true,
          fromCache: true,
          products: cachedData.products,
          count: cachedData.products.length
        });
      } else {
        searchCache.delete(cacheKey);
      }
    }

    // Build Atlas Search pipeline
    const searchStage = {
      index: 'default',
      compound: {
        should: [
          {
            text: {
              query: query,
              path: 'name',
              score: { boost: { value: 3 } },
              fuzzy: enableFuzzy ? { maxEdits: 2 } : undefined
            }
          },
          {
            text: {
              query: query,
              path: 'description',
              score: { boost: { value: 1.5 } },
              fuzzy: enableFuzzy ? { maxEdits: 2 } : undefined
            }
          }
        ]
      }
    };

    if (category && category.trim()) {
      searchStage.compound.filter = [{
        text: {
          query: category.trim(),
          path: 'category'
        }
      }];
    }

    const pipeline = [
      { $search: searchStage },
      {
        $addFields: {
          score: { $meta: 'searchScore' }
        }
      },
      { $limit: 20 },
      {
        $project: {
          __v: 0
        }
      }
    ];

    const products = await Product.aggregate(pipeline);

    searchCache.set(cacheKey, {
      products,
      timestamp: Date.now()
    });

    if (searchCache.size > 1000) {
      const entries = Array.from(searchCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 500).forEach(([key]) => searchCache.delete(key));
    }

    res.status(httpStatus.OK).json({
      success: true,
      products,
      count: products.length
    });
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal error while searching products"
    });
  }
};

export const getProductAutocomplete = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(httpStatus.OK).json({
        success: true,
        suggestions: []
      });
    }

    const query = q.trim();
    const cacheKey = `autocomplete_${query}`;

    if (searchCache.has(cacheKey)) {
      const cachedData = searchCache.get(cacheKey);
      if (Date.now() - cachedData.timestamp < CACHE_TTL) {
        return res.status(httpStatus.OK).json({
          success: true,
          fromCache: true,
          suggestions: cachedData.suggestions
        });
      }
    }

    const pipeline = [
      {
        $search: {
          index: 'product_search',
          text: {
            query: query,
            path: 'name',
            fuzzy: { maxEdits: 1 }
          }
        }
      },
      { $limit: 5 },
      {
        $project: {
          name: 1,
          category: 1,
          _id: 1
        }
      }
    ];

    const suggestions = await Product.aggregate(pipeline);

    searchCache.set(cacheKey, {
      suggestions,
      timestamp: Date.now()
    });

    res.status(httpStatus.OK).json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error("Error autocomplete:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal error"
    });
  }
};

export const getProductAsCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Product ID is required"
      });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: "Invalid product ID format"
      });
    }

    const product = await Product.findById(id)
      .select('-__v')
      .lean();

    if (!product) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "Product not found"
      });
    }

    const categoryFormatted = product.category;
    const categoryAsProduct = Product.findMany({ category: categoryFormatted })
      .select('-__v')
      .lean();

    res.status(httpStatus.OK).json({
      success: true,
      product,
      categoryProducts: categoryAsProduct
    });
  } catch (error) {
    console.error("Error fetching products as categories:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error"
    });
  }
}