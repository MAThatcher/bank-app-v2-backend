const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sendVerificationEmail } = require('../services/NodeMailer');
const {
    generateAccessToken,
    generateRefreshToken,
} = require('../services/AuthService');
const UsersModel = require('../models/Users.model');
require('dotenv').config();

module.exports = {
    deleteUser: async (req, res) => {
        const { email } = req.params;
        try {
            if (req.user.user.email === email) {
                await UsersModel.begin();
                await UsersModel.softDeleteUserByEmail(email);
                await UsersModel.commit();
                return res.json({ message: 'User Deleted Successfully' });
            }
            return res.status(403).json({ error: 'Unauthorized' });
        } catch (err) {
            await UsersModel.rollback();
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    getUserDetails: async (req, res) => {
        try {
            const result = await UsersModel.getUserDetailsByEmail(req.user.user.email);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.json(result.rows[0]);
        } catch (err) {
            console.error(err.message);
            return res.status(500).json({ error: 'Server Error' });
        }
    },

    login: async (req, res) => {
        const { email, password } = req.body;
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
            const accessToken = generateAccessToken({ user });
            const refreshToken = generateRefreshToken({ user });
            return res.json({ accessToken, refreshToken, message: 'Login Successful' });
        } catch (err) {
            console.error(err.message);
            return res.status(500).send('Server Error');
        }
    },

    register: async (req, res) => {
        const { email, password } = req.body;

        try {
            const userExists = await UsersModel.findUserByEmail(email);
            if (userExists.rows.length > 0) {
                return res.status(400).json({ error: 'Email is already registered' });
            }
            const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });

            const hashedPassword = await bcrypt.hash(password, 10);
            await UsersModel.begin();
            await sendVerificationEmail(email, token);
            let newUserId = await UsersModel.insertUser(email, hashedPassword);
            await UsersModel.insertUserDetails(newUserId.rows[0].id);
            await UsersModel.commit();
            return res.status(200).json({ message: 'Verification email sent. Please check your inbox.' });
        } catch (err) {
            await UsersModel.rollback();
            console.log(err.message);
            return res.status(500).json({ error: 'Server Error' });
        }
    },

    verifyEmail: async (req, res) => {
        const { token } = req.params;

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const { email } = decoded;

            await UsersModel.begin();
            await UsersModel.setVerifiedByEmail(email);
            await UsersModel.commit();
            return res.status(200).json({ message: 'Email successfully verified.' });
        } catch (error) {
            await UsersModel.rollback();
            console.log('Error verifying email:', error.message);
            return res.status(500).json({ error: 'Server Error' });
        }
    },
};
