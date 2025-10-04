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
        logger.debug('auth.refresh start: %o', { requestId: rid });
        try {
            logger.debug('auth.refresh validating existing token: %o', { requestId: rid });
            if (!refreshToken) {
                logger.warn('auth.refresh No token found: %o', { requestId: rid });

                return res.status(400).json({ message: 'No refresh token found' });
            }
            let token = await AuthModel.findRefreshToken(refreshToken);
            logger.debug('auth.refresh existing token found: %o', { requestId: rid });
            if (!token.rows[0].valid || token.rows.length === 0) {
                logger.warn('auth.refresh Invalid token found: %o', { requestId: rid });
                return res.sendStatus(403).json({ message: 'Refresh Token not found' });
            }
            logger.debug('auth.refresh verifying token: %o', { requestId: rid });
            jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, user) => {
                if (err) {
                    logger.warn('auth.refresh Token verification failed: %o', { requestId: rid });
                    return res.sendStatus(403).json({ message: 'Refresh Token not valid' });;
                }
                logger.debug('auth.refresh generating new access token: %o', { requestId: rid });
                let accessToken = generateAccessToken({ user });
                logger.info('auth.refresh new access token generated: %o', { requestId: rid });
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
            logger.debug('forgotPassword start: %o', { email });
            const { email } = req.body;
            logger.debug('forgotPassword looking for user: %o', { email });
            const user = await AuthModel.findUserByEmailVerified(email);
            if (user.rows.length === 0) {
                logger.warn('forgotPassword user not found: %o', { email });
                return res.status(400).json({ message: 'User not found' });
            }
            logger.debug('forgotPassword user found, generating token: %o', { email });
            const token = jwt.sign(user.rows[0], process.env.JWT_SECRET, { expiresIn: '15m' });
            logger.debug('forgotPassword sending reset email: %o', { email });
            sendResetEmail(token, email);
            logger.info('forgotPassword reset email sent: %o', { email });
            return res.status(200).json({ message: 'Password reset email sent' });
        } catch (error) {
            logger.error('forgotPassword error: %o', error, { requestId: rid });
            return res.status(500).json({ message: 'Error sending email' });
        }
    },

    resetPassword: async (req, res) => {
        const rid = req.requestId
        logger.debug('resetPassword start', { requestId: rid });
        const { password, token } = req.body;
        try {
            logger.debug('resetPassword verifying token: %o', { requestId: rid });
            if (!token) {
                logger.warn('resetPassword No token found: %o', { requestId: rid });
                return res.status(400).json({ message: 'No token provided' });
            }
            logger.debug('resetPassword decoding token: %o', { requestId: rid });
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            logger.debug('resetPassword token decoded: %o', { requestId: rid });
            if (!decoded || !decoded.id) {
                logger.warn('resetPassword Invalid token: %o', { requestId: rid });
                return res.status(400).json({ message: 'Invalid token' });
            }
            logger.debug('resetPassword looking for user: %o', { requestId: rid });
            const user = await AuthModel.findUserByIdVerified(decoded.id);
            if (!user) {
                logger.warn('resetPassword User not found: %o', { requestId: rid });
                return res.status(400).json({ message: 'Invalid token' });
            }
            logger.debug('resetPassword hashing new password: %o', { requestId: rid });
            const hashedPassword = await bcrypt.hash(password, 10);
            logger.debug('resetPassword updating user password: %o', { requestId: rid });
            await AuthModel.updateUserPassword(hashedPassword, decoded.id);
            logger.info('resetPassword password updated successfully: %o', { requestId: rid });
            return res.status(200).json({ message: 'Password reset successfully' });
        } catch (err) {
            logger.error('resetPassword error: %o', err, { requestId: rid });
            return res.status(500).json({ message: 'Failed to reset password' });
        }
    }
};
