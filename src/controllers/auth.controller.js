const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { generateAccessToken } = require('../services/AuthService');
const { sendResetEmail } = require('../services/NodeMailer');
const AuthModel = require('../models/Auth.model');
require('dotenv').config();
const logger = require('../Utilities/logger');
const { log } = require('winston');

module.exports = {
    refresh: async (req, res) => {
        const rid = req.requestId;
        const { refreshToken } = req.body;
        try {
            if (!refreshToken) {
                return res.status(400).json({ message: 'No refresh token found' });
            }
            let token = await AuthModel.findRefreshToken(refreshToken);
            if (!token.rows[0].valid || token.rows.length === 0) {
                return res.sendStatus(403).json({ message: 'Refresh Token not found' });
            }
            jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, user) => {
                if (err) {
                    return res.sendStatus(403).json({ message: 'Refresh Token not valid' });;
                }
                let accessToken = generateAccessToken({ user });
                return res.status(200).json({ accessToken });
            });
        } catch (error) {
            logger.error('auth.refresh error: %o', { requestId: rid, error: error });
            return res.status(500).json({ message: 'Error' });
        }
    },

    forgotPassword: async (req, res) => {
        const rid = req.requestId
        try {
            const { email } = req.body;
            const user = await AuthModel.findUserByEmailVerified(email);
            if (user.rows.length === 0) {
                return res.status(400).json({ message: 'User not found' });
            }
            const token = jwt.sign(user.rows[0], process.env.JWT_SECRET, { expiresIn: '15m' });
            sendResetEmail(token, email);
            return res.status(200).json({ message: 'Password reset email sent' });
        } catch (error) {
            logger.error('forgotPassword error: %o', error, { requestId: rid });
            return res.status(500).json({ message: 'Error sending email' });
        }
    },

    resetPassword: async (req, res) => {
        const rid = req.requestId
        const { password, token } = req.body;
        try {
            if (!token) {
                return res.status(400).json({ message: 'No token provided' });
            }
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (!decoded || !decoded.id) {
                return res.status(400).json({ message: 'Invalid token' });
            }
            const user = await AuthModel.findUserByIdVerified(decoded.id);
            if (!user) {
                return res.status(404).json({ message: 'User Not Found' });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            await AuthModel.updateUserPassword(hashedPassword, decoded.id);
            return res.status(200).json({ message: 'Password reset successfully' });
        } catch (err) {
            logger.error('resetPassword error: %o', err, { requestId: rid });
            return res.status(500).json({ message: 'Failed to reset password' });
        }
    }
};
