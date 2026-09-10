const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const AuthService = require('../services/AuthService');
const { sendResetEmail } = require('../services/NodeMailer');
const AuthModel = require('../models/Auth.model');
const UsersModel = require('../models/Users.model');
require('dotenv').config();
const logger = require('../Utilities/logger');
//const { log } = require('winston');

module.exports = {
    refresh: async (req, res) => {
        const rid = req.requestId;
        const refreshToken = req.cookies?.refreshToken;
        try {
            if (!refreshToken) {
                return res.status(401).json({ message: 'No refresh token found' });
            }
            let token = await AuthModel.findRefreshToken(refreshToken);
            if (!token.rows[0]?.valid || token.rows.length === 0) {
                return res.status(403).json({ message: 'Refresh Token not found' });
            }

            let decoded;
            try {
                decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            } catch (err) {
                logger.error('jwt.verify error: %o', { requestId: rid, error: err });
                return res.status(403).json({ message: 'Refresh Token not valid' });
            }
            const accessToken = await AuthService.generateAccessToken({ user: decoded.user });
            logger.info('Token refreshed successfully', { requestId: rid });
            return res.status(200).json({ accessToken });
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
    },

    login: async (req, res) => {
        const { email, password } = req.body;
        const rid = req.requestId;
        try {
            const result = await UsersModel.findUserByEmailVerified(email);
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Email not found' });
            }
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid password' });
            }
            delete user.password;
            const accessToken = await AuthService.generateAccessToken({ user });
            const refreshToken = await AuthService.generateRefreshToken({ user });

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                expires: new Date(jwt.decode(refreshToken).exp * 1000)
            });

            return res.status(200).json({ accessToken, message: 'Login Successful' });
        } catch (err) {
            logger.error('login error: %o', { requestId: rid, error: err });
            return res.status(500).send('Server Error');
        }
    },

    logout: async (req, res) => {
        try {
            const refreshToken = req.cookies?.refreshToken;
            if (refreshToken) {
                await AuthModel.invalidateRefreshToken(refreshToken);
            }

            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });

            return res.status(200).json({ message: 'Logout successful' });
        } catch (error) {
            logger.error('logout error: %o', { requestId: req.requestId, error });
            return res.status(500).json({ message: 'Error during logout' });
        }
    },
};
