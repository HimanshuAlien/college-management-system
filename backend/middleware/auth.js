const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'No token, access denied' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        // ✅ Make sure req.user has both id and role available
        req.user = {
            id: user._id.toString(),
            role: user.role,
            name: user.name,
            email: user.email,
            ...user.toObject() // Include all other user fields
        };

        next();
    } catch (error) {
        console.error('Auth error:', error.message);
        res.status(401).json({ message: 'Token is not valid' });
    }
};

const authorize = (roles) => {

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Access Deny , false' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        next();
    };
};

module.exports = { auth, authorize, JWT_SECRET };
