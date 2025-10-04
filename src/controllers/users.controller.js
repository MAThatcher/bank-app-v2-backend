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
        logger.debug('deleteUser start: %o', { requestId: rid, user: req.user?.user?.email });
        try {
            const email = req.user.user.email;
            logger.debug('deleteUser soft deleting user by email: %o', { requestId: rid, user: email });
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
        logger.debug('getUserDetails start: %o', { requestId: rid, user: req.user?.user?.email });
        try {
            logger.debug('getUserDetails fetching user details by email: %o', { requestId: rid, user: req.user?.user?.email });
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
        logger.debug('login attempt: %o', { requestId: rid, email });
        try {
            logger.debug('login fetching user by email: %o', { requestId: rid, email });
            const result = await UsersModel.findUserByEmailVerified(email);
            if (result.rows.length === 0) {
                logger.warn('login failed - email not found: %o', { requestId: rid, email });
                return res.status(401).json({ error: 'Email not found' });
            }

            logger.debug('login comparing password for user: %o', { requestId: rid, email });
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                logger.warn('login failed - invalid password: %o', { requestId: rid, email });
                return res.status(401).json({ error: 'Invalid password' });
            }
            delete user.password;
            logger.debug('login generating access token for user: %o', { requestId: rid, email });
            const accessToken = generateAccessToken({ user });
            logger.debug('login generating refresh token for user: %o', { requestId: rid, email });
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
        logger.debug('register attempt: %o', { requestId: rid, email });
        try {
            if (!email || !password) {
                logger.warn('register failed - missing fields: %o', { requestId: rid, email });
                return res.status(400).json({ error: 'Email and password are required' });
            }
            logger.debug('register checking if email already exists: %o', { requestId: rid, email });
            const userExists = await UsersModel.findUserByEmail(email);
            if (userExists.rows.length > 0) {
                logger.warn('register failed - email exists: %o', { requestId: rid, email });
                return res.status(400).json({ error: 'Email is already registered' });
            }
            logger.debug('register creating verification token: %o', { requestId: rid, email });
            const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
            logger.debug('register hashing password: %o', { requestId: rid, email });
            const hashedPassword = await bcrypt.hash(password, 10);

            await require('../prisma/client').runTransaction(async (tx) => {
                logger.debug('register sending verification email: %o', { requestId: rid, email });
                await sendVerificationEmail(email, token);
                logger.debug('register inserting new user into DB: %o', { requestId: rid, email });
                let newUserId = await UsersModel.insertUser(email, hashedPassword, tx);
                logger.debug('register inserting user details into DB: %o', { requestId: rid, email, userId: newUserId.rows[0].id });
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
        logger.debug('verifyEmail start: %o', { requestId: rid });
        try {
            if (!token) {
                logger.warn('verifyEmail failed - no token: %o', { requestId: rid });
                return res.status(400).json({ error: 'No token provided' });
            }
            logger.debug('verifyEmail decoding token: %o', { requestId: rid });
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (!decoded || !decoded.email) {
                logger.warn('verifyEmail failed - invalid token: %o', { requestId: rid });
                return res.status(400).json({ error: 'Invalid token' });
            }
            logger.debug('verifyEmail setting user as verified: %o', { requestId: rid, email: decoded.email });
            const { email } = decoded;
            const user = await UsersModel.findUserByEmail(email);
            if (user.rows.length === 0) {
                logger.warn('verifyEmail failed - user not found: %o', { requestId: rid, email });
                return res.status(400).json({ error: 'Invalid token' });
            }
            if (user.rows[0].isVerified) {
                logger.warn('verifyEmail failed - user already verified: %o', { requestId: rid, email });
                return res.status(400).json({ error: 'Email is already verified' });
            }
            logger.debug('verifyEmail updating user to verified in DB: %o', { requestId: rid, email });
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
        return res.status(501).json({ error: 'Not Implemented' });
    },

    changePassword: async (req, res) => {
        return res.status(501).json({ error: 'Not Implemented' });
    }
};
