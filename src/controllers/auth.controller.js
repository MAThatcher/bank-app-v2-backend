const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { generateAccessToken } = require('../services/AuthService');
const { sendResetEmail } = require('../services/NodeMailer');
const AuthModel = require('../models/Auth.model');
require('dotenv').config();

module.exports = {
    refresh: async (req, res) => {
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
            console.error(error);
            return res.status(500).json({ message: 'Error' });
        }
    },

    forgotPassword: async (req, res) => {
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
            console.log(error);
            return res.status(500).json({ message: 'Error sending email' });
        }
    },

    resetPassword: async (req, res) => {
        const { password, token } = req.body;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await AuthModel.findUserByIdVerified(decoded.id);
            if (!user) {
                return res.status(400).json({ message: 'Invalid token' });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            await AuthModel.updateUserPassword(hashedPassword, decoded.id);
            return res.status(200).json({ message: 'Password reset successfully' });
        } catch (err) {
            console.error(err.message);
            return res.status(500).json({ message: 'Failed to reset password' });
        }
    }
};
