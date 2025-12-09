import mongoose, { Schema } from "mongoose";

const imageSchema = new Schema({
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['image', 'video'],
    default: 'image'
  }
});

const sizeSchema = new Schema({
  size: {
    type: String,
    required: true
  },
  stock: {
    type: Number,
    required: true,
    min: 0
  },
  originalPrice: {
    type: Number,
    required: true,
    min: 100
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: true });

const variantSchema = new Schema({
  color: {
    type: String,
    required: true
  },
  sizes: [sizeSchema],
  images: [imageSchema]
}, { _id: true });

const productSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  variants: [variantSchema],
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  allowedPaymentMethods: {
    type: [String],
    enum: ['cod', 'card', 'upi', 'wallet'],
    default: ['cod', 'card', 'upi', 'wallet'],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one payment method must be allowed'
    }
  }
}, { timestamps: true });


productSchema.index({ category: 1, createdAt: -1 });
productSchema.index({ owner: 1 });

const Product = mongoose.model("Product", productSchema);
export default Product;