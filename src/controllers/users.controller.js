const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sendVerificationEmail } = require('../services/NodeMailer');
const {
    generateAccessToken,
    generateRefreshToken,
} = require('../services/AuthService');
const UsersModel = require('../models/Users.model');
require('dotenv').config();
const logger = require('../Utilities/logger');

module.exports = {
    deleteUser: async (req, res) => {
        const rid = req.requestId;
        logger.info('deleteUser start: %o', { requestId: rid, user: req.user?.user?.email });
        try {
            const email = req.user.user.email;
            await require('../prisma/client').runTransaction(async (tx) => {
                await UsersModel.softDeleteUserByEmail(email, tx);
            });
            logger.info('deleteUser success: %o', { requestId: rid, user: email });
            return res.json({ message: 'User Deleted Successfully' });
        } catch (err) {
            logger.error('deleteUser error: %o', { requestId: rid, error: err });
            return res.status(500).send('Server Error');
        }
    },

    getUserDetails: async (req, res) => {
        const rid = req.requestId;
        logger.info('getUserDetails start: %o', { requestId: rid, user: req.user?.user?.email });
        try {
            const result = await UsersModel.getUserDetailsByEmail(req.user.user.email);
            if (result.rows.length === 0) {
                logger.warn('getUserDetails not found: %o', { requestId: rid, user: req.user?.user?.email });
                return res.status(404).json({ error: 'User not found' });
            }
            logger.info('getUserDetails success: %o', { requestId: rid, user: req.user?.user?.email });
            return res.status(200).json(result.rows[0]);
        } catch (err) {
            logger.error('getUserDetails error: %o', { requestId: rid, error: err });
            return res.status(500).json({ error: 'Server Error' });
        }
    },

    login: async (req, res) => {
        const { email, password } = req.body;
        const rid = req.requestId;
        logger.info('login attempt: %o', { requestId: rid, email });
        try {
            const result = await UsersModel.findUserByEmailVerified(email);
            if (result.rows.length === 0) {
                logger.warn('login failed - email not found: %o', { requestId: rid, email });
                return res.status(401).json({ error: 'Email not found' });
            }

            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                logger.warn('login failed - invalid password: %o', { requestId: rid, email });
                return res.status(401).json({ error: 'Invalid password' });
            }
            const accessToken = generateAccessToken({ user });
            const refreshToken = generateRefreshToken({ user });
            logger.info('login success: %o', { requestId: rid, user: user.email, userId: user.id });
            return res.status(200).json({ accessToken, refreshToken, message: 'Login Successful' });
        } catch (err) {
            logger.error('login error: %o', { requestId: rid, error: err });
            return res.status(500).send('Server Error');
        }
    },

    register: async (req, res) => {
        const { email, password } = req.body;
        const rid = req.requestId;
        logger.info('register attempt: %o', { requestId: rid, email });
        try {
            const userExists = await UsersModel.findUserByEmail(email);
            if (userExists.rows.length > 0) {
                logger.warn('register failed - email exists: %o', { requestId: rid, email });
                return res.status(400).json({ error: 'Email is already registered' });
            }
            const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });

            const hashedPassword = await bcrypt.hash(password, 10);

            await require('../prisma/client').runTransaction(async (tx) => {
                await sendVerificationEmail(email, token);
                let newUserId = await UsersModel.insertUser(email, hashedPassword, tx);
                await UsersModel.insertUserDetails(newUserId.rows[0].id, tx);
            });
            logger.info('register success - verification email sent: %o', { requestId: rid, email });
            return res.status(201).json({ message: 'Verification email sent. Please check your inbox.' });
        } catch (err) {
            logger.error('register error: %o', { requestId: rid, error: err });
            return res.status(500).json({ error: 'Server Error' });
        }
    },

    verifyEmail: async (req, res) => {
        const { token } = req.params;
        const rid = req.requestId;
        logger.info('verifyEmail start: %o', { requestId: rid });
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const { email } = decoded;

            await require('../prisma/client').runTransaction(async (tx) => {
                await UsersModel.setVerifiedByEmail(email, tx);
            });
            logger.info('verifyEmail success: %o', { requestId: rid, email });
            return res.status(200).json({ message: 'Email successfully verified.' });
        } catch (error) {
            logger.error('verifyEmail error: %o', { requestId: rid, error });
            return res.status(500).json({ error: 'Server Error' });
        }
    },
    //TODO
    logout: async (req, res) => {
        const rid = req.requestId;
        logger.info('logout called: %o', { requestId: rid, user: req.user?.user?.email });
        return res.status(501).json({ error: 'Not Implemented' });
    },

    changePassword: async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        const rid = req.requestId;
        logger.info('changePassword attempt: %o', { requestId: rid, user: req.user?.user?.email });
        try {
            const email = req.user.user.email;
            const result = await UsersModel.findUserByEmail(email);
            if (result.rows.length === 0) {
                logger.warn('changePassword failed - user not found: %o', { requestId: rid, user: email });
                return res.status(404).json({ error: 'User not found' });
            }
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                logger.warn('changePassword failed - invalid current password: %o', { requestId: rid, user: email });
                return res.status(401).json({ error: 'Invalid current password' });
            }
            const hashedNewPassword = await bcrypt.hash(newPassword, 10);
            await require('../prisma/client').runTransaction(async (tx) => {
                await UsersModel.updatePasswordByEmail(email, hashedNewPassword, tx);
            });
            logger.info('changePassword success: %o', { requestId: rid, user: email });
            return res.status(200).json({ message: 'Password changed successfully' });
        } catch (err) {
            logger.error('changePassword error: %o', { requestId: rid, error: err });
            return res.status(501).json({ error: 'Not Implemented' });
        }
    }
};
