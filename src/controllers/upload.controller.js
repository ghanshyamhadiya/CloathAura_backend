import cloudinary from "../utils/cloudinary.js";

// Upload single image/video with type detection and optimization
export const uploadToCloudinary = async (file, folder = "products") => {
  try {
    const base64 = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    
    // Determine resource type
    const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    
    const result = await cloudinary.uploader.upload(base64, {
      folder,
      resource_type: resourceType,
      
      // ✅ Optimize images for faster upload
      ...(resourceType === 'image' && {
        quality: "auto:good", // Automatic quality optimization
        fetch_format: "auto", // Automatic format selection (WebP when supported)
        flags: "progressive", // Progressive loading
      }),
      
      // Video specific settings
      ...(resourceType === 'video' && {
        quality: "auto:good",
        eager: [
          { 
            width: 720, 
            height: 480, 
            crop: "limit",
            quality: "auto:good" 
          }
        ],
        eager_async: true, // ✅ Process transformations asynchronously (faster response)
      })
    });
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
      type: resourceType
    };
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw error;
  }
};

// ✅ Upload multiple images/videos IN PARALLEL with size limits
export const uploadMultipleToCloudinary = async (files, folder = "products") => {
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB for videos
  const MAX_FILES = 5; // Maximum 5 files per review
  
  if (files.length > MAX_FILES) {
    throw new Error(`Maximum ${MAX_FILES} files allowed`);
  }
  
  // Validate file sizes
  for (const file of files) {
    const isVideo = file.mimetype.startsWith('video/');
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      throw new Error(`File "${file.originalname}" exceeds ${maxSizeMB}MB limit`);
    }
  }
  
  // ✅ Upload all files in parallel for maximum speed
  const uploadPromises = files.map(file => uploadToCloudinary(file, folder));
  return await Promise.all(uploadPromises);
};

// Delete single image/video from Cloudinary using public ID
export const deleteFromCloudinary = async (publicId) => {
  try {
    // Try deleting as image first, then video if that fails
    let result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result !== 'ok') {
      // Try as video
      result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'video'
      });
    }
    
    return result.result === 'ok';
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    throw error;
  }
};

// ✅ Delete multiple images/videos IN PARALLEL
export const deleteMultipleFromCloudinary = async (publicIds) => {
  try {
    const deletePromises = publicIds.map(id => deleteFromCloudinary(id));
    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    console.error("Error deleting multiple files:", error);
    throw error;
  }
};