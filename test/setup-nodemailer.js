const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({
  sendMail: () => Promise.resolve({}),
});

module.exports = {};
