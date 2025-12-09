import jwt from 'jsonwebtoken';

// Use the correct environment variable names
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export const generateToken = (payload) => {
    try {
        const enhancedPayload = {
            ...payload,
            iat: Math.floor(Date.now() / 1000),
        };

        const accessToken = jwt.sign(enhancedPayload, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
        });

        const refreshToken = jwt.sign(enhancedPayload, JWT_REFRESH_SECRET, {
            expiresIn: JWT_REFRESH_EXPIRES_IN,
        });

        return { accessToken, refreshToken };
    } catch (error) {
        console.error('Token generation failed:', error);
        throw new Error('Failed to generate tokens');
    }
};

export const verifyToken = (token, type = 'access') => {
    if (!token || typeof token !== 'string') {
        throw new Error('Invalid token format');
    }

    try {
        const secret = type === 'refresh' ? JWT_REFRESH_SECRET : JWT_SECRET;
        
        const decoded = jwt.verify(token, secret);
        return decoded;
    } catch (error) {
        console.error('Token verification error:', error.message);
        
        // Enhanced error handling
        switch (error.name) {
            case 'TokenExpiredError':
                throw new Error('Token has expired');
            case 'JsonWebTokenError':
                if (error.message.includes('invalid signature')) {
                    throw new Error('Invalid token signature');
                } else if (error.message.includes('malformed')) {
                    throw new Error('Malformed token');
                } else {
                    throw new Error('Invalid token');
                }
            case 'NotBeforeError':
                throw new Error('Token not active yet');
            default:
                throw new Error('Token verification failed');
        }
    }
};