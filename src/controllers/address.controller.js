import httpStatus from "http-status";
import User from "../models/user.model.js";
import mongoose from "mongoose";
//Address

// Get all addresses for the authenticated user
export const getUserAddresses = async (req, res) => {
    let userId = req.userId;
    try {
        const user = await User.findById(userId).select('addresses');
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
        }
        res.status(httpStatus.OK).json({ addresses: user.addresses });
    } catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Internal server error" });
    }
};

// Add a new address
export const addUserAddress = async (req, res) => {
    let userId = req.userId;
    const { street, city, state, postalCode, isDefault } = req.body;
    
    // Validate required fields
    if (!street || !city || !state || !postalCode) {
        return res.status(httpStatus.BAD_REQUEST).json({ 
            message: "All address fields (street, city, state, postalCode) are required" 
        });
    }
    
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
        }
        
        const newAddress = { street, city, state, postalCode, isDefault: !!isDefault };
        
        if (isDefault) {
            user.addresses.forEach(addr => (addr.isDefault = false)); // Clear other defaults
        }
        
        user.addresses.push(newAddress);
        await user.save();
        
        const addedAddress = user.addresses[user.addresses.length - 1];
        res.status(httpStatus.CREATED).json({ 
            message: "Address added successfully", 
            address: addedAddress 
        });
    } catch (error) {
        console.error("Error adding address:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Internal server error" });
    }
};

// Update address - FIXED VERSION
export const updateUserAddress = async (req, res) => {
    let userId = req.userId;
    const { addressId } = req.params;
    const { street, city, state, postalCode, isDefault } = req.body;

    console.log('Received addressId:', addressId); // Debugging
    
    if (!addressId) {
        return res.status(httpStatus.BAD_REQUEST).json({ 
            message: "Address ID is required" 
        });
    }

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        console.log(`Invalid addressId format: ${addressId}`);
        return res.status(httpStatus.BAD_REQUEST).json({ 
            message: "Invalid address ID format" 
        });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ 
                message: "User not found" 
            });
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            console.log(`Address ${addressId} not found for user ${userId}`);
            console.log('Available addresses:', user.addresses.map(a => ({ id: a._id.toString(), street: a.street })));
            return res.status(httpStatus.NOT_FOUND).json({ 
                message: "Address not found" 
            });
        }

        // Update address fields only if provided
        if (street !== undefined) address.street = street;
        if (city !== undefined) address.city = city;
        if (state !== undefined) address.state = state;
        if (postalCode !== undefined) address.postalCode = postalCode;

        if (isDefault !== undefined) {
            if (isDefault) {
                user.addresses.forEach(addr => (addr.isDefault = false));
            }
            address.isDefault = !!isDefault;
        }

        await user.save();

        res.status(httpStatus.OK).json({ 
            message: "Address updated successfully", 
            address 
        });
    } catch (error) {
        console.error("Error updating address:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ 
            message: "Internal server error",
            error: error.message 
        });
    }
};

// Delete an address
export const deleteUserAddress = async (req, res) => {
    let userId = req.userId;
    const { addressId } = req.params;
    
    if (!addressId) {
        return res.status(httpStatus.BAD_REQUEST).json({ 
            message: "Address ID is required" 
        });
    }

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        return res.status(httpStatus.BAD_REQUEST).json({ 
            message: "Invalid address ID format" 
        });
    }
    
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
        }
        
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "Address not found" });
        }
        
        user.addresses.pull(addressId);
        await user.save();
        
        res.status(httpStatus.OK).json({ message: "Address deleted successfully" });
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Internal server error" });
    }
};

// Set an address as default - FIXED VERSION
export const setDefaultAddress = async (req, res) => {
    let userId = req.userId;
    const { addressId } = req.params;
    
    // Add validation for addressId
    if (!addressId) {
        return res.status(httpStatus.BAD_REQUEST).json({ 
            message: "Address ID is required" 
        });
    }

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        return res.status(httpStatus.BAD_REQUEST).json({ 
            message: "Invalid address ID format" 
        });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ 
                message: "User not found" 
            });
        }

        // Check if the address exists
        const address = user.addresses.id(addressId);
        if (!address) {
            console.log(`Address ${addressId} not found for user ${userId}`);
            console.log('Available addresses:', user.addresses.map(a => a._id.toString()));
            return res.status(httpStatus.NOT_FOUND).json({ 
                message: "Address not found" 
            });
        }

        // Set all addresses to non-default first, then set the selected one as default
        user.addresses.forEach(addr => {
            addr.isDefault = addr._id.toString() === addressId;
        });

        await user.save();
        
        res.status(httpStatus.OK).json({ 
            message: "Default address set successfully", 
            address 
        });
    } catch (error) {
        console.error("Error setting default address:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ 
            message: "Internal server error",
            error: error.message 
        });
    }
};