import Review from "../models/review.model.js";
import { uploadMultipleToCloudinary, deleteMultipleFromCloudinary } from "./upload.controller.js";

export const createReview = async (req, res) => {
  const { productId, content, rating } = req.body;
  const userId = req.userId;

  try {
    // Validate inputs
    if (!productId || !content || !rating) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let media = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleToCloudinary(req.files, "reviews");
        media = uploadResults;
        console.log("Uploaded media:", media);
      } catch (uploadError) {
        return res.status(400).json({ message: uploadError.message || "Error uploading media files" });
      }
    }

    const newReview = new Review({
      productId,
      userId,
      content,
      rating,
      media,
    });

    await newReview.save();
    await newReview.populate("userId", "username email");

    req.io.emit("newReview", newReview);
    res.status(201).json(newReview);
  } catch (error) {
    if (media.length > 0) {
      try {
        await deleteMultipleFromCloudinary(media.map((m) => m.publicId));
      } catch (cleanupError) {
        console.error("Error cleaning up uploaded files:", cleanupError);
      }
    }
    res.status(500).json({ message: "Error creating review", error: error.message });
  }
};

export const updateReview = async (req, res) => {
  const { content, rating, existingMediaToKeep } = req.body;
  const userId = req.userId;
  const reviewId = req.params.id;

  try {
    const existingReview = await Review.findOne({ _id: reviewId, userId });
    if (!existingReview) {
      return res.status(404).json({ message: "Review not found or user not authorized" });
    }

    let media = [];
    let oldMediaToDelete = [];

    // Parse existing media to keep (if provided)
    let mediaToKeep = [];
    if (existingMediaToKeep) {
      try {
        mediaToKeep = JSON.parse(existingMediaToKeep);
      } catch (e) {
        console.error("Error parsing existingMediaToKeep:", e);
        mediaToKeep = [];
      }
    }

    // Determine which old media to delete
    if (existingReview.media && existingReview.media.length > 0) {
      const mediaToKeepIds = mediaToKeep.map(m => m.publicId);
      oldMediaToDelete = existingReview.media.filter(m => !mediaToKeepIds.includes(m.publicId));
    }

    // Start with media to keep
    media = [...mediaToKeep];

    // Add new uploaded files
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleToCloudinary(req.files, "reviews");
        media = [...media, ...uploadResults];
      } catch (uploadError) {
        return res.status(400).json({ message: uploadError.message || "Error uploading media files" });
      }
    }

    // Update the review
    const updatedReview = await Review.findByIdAndUpdate(
      reviewId,
      { content, rating, media },
      { new: true }
    ).populate("userId", "name email");

    if (!updatedReview) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Delete old media that was removed
    if (oldMediaToDelete.length > 0) {
      try {
        await deleteMultipleFromCloudinary(oldMediaToDelete.map((m) => m.publicId));
        console.log("Deleted old media:", oldMediaToDelete.map(m => m.publicId));
      } catch (deleteError) {
        console.error("Error deleting old media:", deleteError);
        // Don't fail the request if cleanup fails
      }
    }

    req.io.emit("updateReview", updatedReview);
    res.json(updatedReview);
  } catch (error) {
    // Cleanup newly uploaded files if update failed
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleToCloudinary(req.files, "reviews");
        await deleteMultipleFromCloudinary(uploadResults.map((m) => m.publicId));
      } catch (cleanupError) {
        console.error("Error cleaning up uploaded files:", cleanupError);
      }
    }
    res.status(500).json({ message: "Error updating review", error: error.message });
  }
};

// Other controllers (deleteReview, getReviewsByProduct, getReviewsByUser) remain unchanged

export const deleteReview = async (req, res) => {
    const userId = req.userId;
    const reviewId = req.params.id;

    try {
        const deletedReview = await Review.findOneAndDelete({ _id: reviewId, userId });

        if (!deletedReview) {
            return res.status(404).json({ message: "Review not found or user not authorized" });
        }

        // Delete associated media from Cloudinary
        if (deletedReview.media && deletedReview.media.length > 0) {
            try {
                await deleteMultipleFromCloudinary(deletedReview.media.map(m => m.publicId));
            } catch (deleteError) {
                console.error("Error deleting media files:", deleteError);
            }
        }

        req.io.emit("deleteReview", deletedReview);
        res.json({ message: "Review deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting review", error: error.message });
    }
};

export const getReviewsByProduct = async (req, res) => {
    const { productId } = req.params;

    try {
        const reviews = await Review.find({ productId }).populate("userId", "username email");
        res.json(reviews);
    } catch (error) {
        res.status(500).json({ message: "Error fetching reviews", error: error.message });
    }
};

export const getReviewsByUser = async (req, res) => {
    const userId = req.userId;

    try {
        const reviews = await Review.find({ userId }).populate("productId", "username email");
        res.json(reviews);
    } catch (error) {
        res.status(500).json({ message: "Error fetching reviews", error: error.message });
    }
};