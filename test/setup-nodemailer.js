// Prevent nodemailer from making real network calls during tests.
// This file is loaded via Jest's setupFiles before any tests execute.
const nodemailer = require('nodemailer');
// replace createTransport with a no-op transporter that resolves sendMail
nodemailer.createTransport = () => ({
  sendMail: () => Promise.resolve({}),
});

module.exports = {};
