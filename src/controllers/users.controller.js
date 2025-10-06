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
        try {
            const email = req.user.user.email;
            await require('../prisma/client').runTransaction(async (tx) => {
                await UsersModel.softDeleteUserByEmail(email, tx);
            });
            return res.json({ message: 'User Deleted Successfully' });
        } catch (err) {
            logger.error('deleteUser error: %o', { requestId: rid, error: err });
            return res.status(500).send('Server Error');
        }
    },

    getUserDetails: async (req, res) => {
        const rid = req.requestId;
        try {
            const result = await UsersModel.getUserDetailsByEmail(req.user.user.email);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.status(200).json(result.rows[0]);
        } catch (err) {
            logger.error('getUserDetails error: %o', { requestId: rid, error: err });
            return res.status(500).json({ error: 'Server Error' });
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
            const accessToken = generateAccessToken({ user });
            const refreshToken = generateRefreshToken({ user });
            return res.status(200).json({ accessToken, refreshToken, message: 'Login Successful' });
        } catch (err) {
            logger.error('login error: %o', { requestId: rid, error: err });
            return res.status(500).send('Server Error');
        }
    },

    register: async (req, res) => {
        const { email, password } = req.body;
        const rid = req.requestId;
        try {
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }
            const userExists = await UsersModel.findUserByEmail(email);
            if (userExists.rows.length > 0) {
                return res.status(400).json({ error: 'Email is already registered' });
            }
            const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
            const hashedPassword = await bcrypt.hash(password, 10);
            await require('../prisma/client').runTransaction(async (tx) => {
                await sendVerificationEmail(email, token);
                let newUserId = await UsersModel.insertUser(email, hashedPassword, tx);
                await UsersModel.insertUserDetails(newUserId.rows[0].id, tx);
            });
            return res.status(201).json({ message: 'Verification email sent. Please check your inbox.' });
        } catch (err) {
            logger.error('register error: %o', { requestId: rid, error: err });
            return res.status(500).json({ error: 'Server Error' });
        }
    },

    verifyEmail: async (req, res) => {
        const { token } = req.params;
        const rid = req.requestId;
        try {
            if (!token) {
                console.log('No token provided');
                return res.status(400).json({ error: 'No token provided' });
            }
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log('Decoded token:', decoded);
            if (!decoded) {
                console.log('Invalid token');
                return res.status(400).json({ error: 'Invalid token' });
            }
            const { email } = decoded;
            const user = await UsersModel.findUserByEmail(email);
            if (user.rows.length === 0) {
                console.log('User not found for email:', email);
                return res.status(404).json({ error: 'User not found' });
            }
            if (user.rows[0].isVerified) {
                console.log('Email already verified for:', email);
                return res.status(400).json({ error: 'Email is already verified' });
            }
            await require('../prisma/client').runTransaction(async (tx) => {
                await UsersModel.setVerifiedByEmail(email, tx);
            });
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
