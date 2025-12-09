import mongoose, { Schema } from "mongoose";

const reviewSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    content: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    media: [{
        url: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: ['image', 'video'],
            required: true
        },
        publicId: String // Store Cloudinary public ID for deletion
    }]
}, {
    timestamps: true
});

const Review = mongoose.model("Review", reviewSchema);
export default Review;