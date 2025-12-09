import mongoose, { Schema } from "mongoose";
import argon2 from "argon2";
import crypto from 'crypto';

let cartSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
  },
  variant: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  size: {
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
}, { _id: true });

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    enum: ['user', 'owner', 'admin'],
    default: 'user',
  },
  isApproved: {
    type: Boolean,
    default: false,
  },
  accountCreatedAt: {
    type: Date,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
  refreshToken: {
    type: String,
    default: null,
  },
  emailVerificationToken: {
    type: String,
  },
  addresses: [{
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    _id: { type: Schema.Types.ObjectId, auto: true }
  }],
  emailVerificationExpires: {
    type: Date,
  },
  wishlist: [{
    type: Schema.Types.ObjectId,
    ref: 'Product'
  }],
  orders: [{
    type: Schema.Types.ObjectId,
    ref: "Order"
  }],
  cart: {
    type: [cartSchema],
    default: []
  },
  emailVerificationSentAt: { type: Date },
  emailVerificationResendCount: { type: Number, default: 0 },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
}, {
  timestamps: true,
});

// Add indexes for auth and search
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

// Ensure only one address is marked as default
userSchema.pre('save', async function (next) {
  if (this.isModified('addresses')) {
    const defaultAddresses = this.addresses.filter(addr => addr.isDefault);
    if (defaultAddresses.length > 1) {
      this.addresses.forEach((addr, index) => {
        addr.isDefault = index === this.addresses.length - 1 && addr.isDefault;
      });
    }
  }
  next();
});

// Update cart.unitPrice to match Product size.price
userSchema.pre('save', async function (next) {
  if (this.isModified('cart')) {
    const Product = mongoose.model('Product');
    for (const item of this.cart) {
      const product = await Product.findById(item.product);
      if (product) {
        const variant = product.variants.id(item.variant);
        if (variant) {
          const size = variant.sizes.id(item.size);
          if (size) {
            item.unitPrice = size.price;
          }
        }
      }
    }
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await argon2.hash(this.password, {
      type: argon2.argon2id,
    });
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await argon2.verify(this.password, candidatePassword);
  } catch (err) {
    return false;
  }
};

userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  return resetToken;
};

const User = mongoose.model("User", userSchema);
export default User;