import express from 'express';
import {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    getProducts,
    getProductBySearch,
    getProductAutocomplete,
    ownerProduct
} from '../controllers/product.controller.js';
import { upload } from '../middleware/multer.js';
import {
    authenticationToken,
    ownerAndAdminOperations,
    ownerOperations,
} from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/', getAllProducts);
router.get('/page', getProducts);
router.get('/search', getProductBySearch);
router.get('/autocomplete', getProductAutocomplete);
router.get('/:id', getProductById);

// Owner-specific route — put it clearly
router.get('/owner/products', authenticationToken,ownerOperations, ownerProduct);

// Protected routes
router.post('/', authenticationToken, ownerAndAdminOperations, upload.any(), createProduct);
router.put('/:id', authenticationToken, ownerAndAdminOperations, upload.any(), updateProduct);
router.delete('/:id', authenticationToken, ownerAndAdminOperations, deleteProduct);

export default router;