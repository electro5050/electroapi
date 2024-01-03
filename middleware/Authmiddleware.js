const jwt = require('jsonwebtoken');
require('dotenv').config();

function authMiddleware(req, res, next) {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('Access Denied: No Token Provided!');
    }
    
    const token = authHeader.replace('Bearer ', '');

    if(!process.env.JWT_SECRET) {
        console.error('JWT_SECRET is not set!');
        return res.status(500).send('Server Configuration Error');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next(); // Move to the next middleware/route handler
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(400).send('Invalid Token');
    }
}

module.exports = authMiddleware;





