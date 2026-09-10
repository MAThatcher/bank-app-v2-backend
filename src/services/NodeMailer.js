const nodemailer = require("nodemailer");
const logger = require('../Utilities/logger');

const transporter = nodemailer.createTransport({
  service: "Gmail",
  host: "smtp.gmail.com",
  secure: true,
  port: 465,
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendVerificationEmail = async (email, token) => {

  const verificationLink = `${process.env.CLIENT_URL}/verify-email/${token}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "⚜ IMPERIAL VAULT-THRONE VERIFICATION REQUIRED ⚜",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: 'Cinzel', 'Times New Roman', serif;
            background-color: #0a0a0a;
            color: #d4af37;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            border: 3px solid #d4af37;
            box-shadow: 0 0 20px rgba(212, 175, 55, 0.3);
          }
          .header {
            background: linear-gradient(to bottom, #8b0000 0%, #4a0000 100%);
            padding: 30px;
            text-align: center;
            border-bottom: 2px solid #d4af37;
          }
          .aquila {
            font-size: 48px;
            margin-bottom: 10px;
          }
          .title {
            color: #d4af37;
            font-size: 24px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin: 10px 0;
          }
          .content {
            padding: 40px 30px;
            text-align: center;
          }
          .message {
            color: #c0c0c0;
            font-size: 16px;
            line-height: 1.6;
            margin: 20px 0;
          }
          .verify-button {
            display: inline-block;
            padding: 15px 40px;
            margin: 30px 0;
            background: linear-gradient(to bottom, #8b0000 0%, #4a0000 100%);
            color: #d4af37 !important;
            text-decoration: none;
            font-weight: bold;
            font-size: 18px;
            text-transform: uppercase;
            border: 2px solid #d4af37;
            letter-spacing: 1px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
            transition: all 0.3s;
          }
          .verify-button:hover {
            background: linear-gradient(to bottom, #a00000 0%, #600000 100%);
            box-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
          }
          .decree {
            font-style: italic;
            color: #888;
            font-size: 14px;
            margin: 30px 0;
            padding: 20px;
            border-top: 1px solid #444;
            border-bottom: 1px solid #444;
          }
          .footer {
            background-color: #0a0a0a;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 2px solid #d4af37;
          }
          .purity-seal {
            color: #d4af37;
            font-size: 20px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="aquila">⚜</div>
            <div class="title">Imperial Administratum</div>
            <div style="color: #c0c0c0; font-size: 14px; margin-top: 10px;">
              VAULT-THRONE AUTHORIZATION DIVISION
            </div>
          </div>
          
          <div class="content">
            <div class="purity-seal">⚜ VERIFICATION REQUIRED ⚜</div>
            
            <div class="message">
              <p><strong>Loyal Citizen of the Imperium,</strong></p>
              <p>Your request to establish a Vault-Throne has been received by the Administratum.</p>
              <p>To complete your enrollment and gain access to the Imperial Banking System, you must verify your vox-mail address by Imperial decree.</p>
            </div>
            
            <a href="${verificationLink}" class="verify-button">
              ⚔ VERIFY IDENTITY ⚔
            </a>
            
            <div class="decree">
              "By the authority of the God-Emperor of Mankind, all citizens must verify their identity before accessing Imperial financial systems."
            </div>
            
            <div style="color: #888; font-size: 13px; margin-top: 20px;">
              If you did not request this verification, please disregard this message.<br>
              This authorization expires in 1 hour by Imperial Standard Time.
            </div>
          </div>
          
          <div class="footer">
            <div style="margin-bottom: 10px;">⚜ FOR THE EMPEROR ⚜</div>
            <div>Imperial Vault-Throne Banking System</div>
            <div style="margin-top: 5px;">Serving the Imperium of Man since M41</div>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const sendResetEmail = async (token, email) => {
  const resetLink = `${process.env.CLIENT_URL}/reset-password/${token}`;
  const mailOptions = {
    to: email,
    subject: "⚔ IMPERIAL SECURITY CIPHER RESET AUTHORIZATION ⚔",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: 'Cinzel', 'Times New Roman', serif;
            background-color: #0a0a0a;
            color: #d4af37;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            border: 3px solid #d4af37;
            box-shadow: 0 0 20px rgba(212, 175, 55, 0.3);
          }
          .header {
            background: linear-gradient(to bottom, #8b0000 0%, #4a0000 100%);
            padding: 30px;
            text-align: center;
            border-bottom: 2px solid #d4af37;
          }
          .aquila {
            font-size: 48px;
            margin-bottom: 10px;
          }
          .title {
            color: #d4af37;
            font-size: 24px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin: 10px 0;
          }
          .content {
            padding: 40px 30px;
            text-align: center;
          }
          .warning-box {
            background-color: rgba(139, 0, 0, 0.2);
            border: 2px solid #8b0000;
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .message {
            color: #c0c0c0;
            font-size: 16px;
            line-height: 1.6;
            margin: 20px 0;
          }
          .reset-button {
            display: inline-block;
            padding: 15px 40px;
            margin: 30px 0;
            background: linear-gradient(to bottom, #8b0000 0%, #4a0000 100%);
            color: #d4af37 !important;
            text-decoration: none;
            font-weight: bold;
            font-size: 18px;
            text-transform: uppercase;
            border: 2px solid #d4af37;
            letter-spacing: 1px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
            transition: all 0.3s;
          }
          .reset-button:hover {
            background: linear-gradient(to bottom, #a00000 0%, #600000 100%);
            box-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
          }
          .decree {
            font-style: italic;
            color: #888;
            font-size: 14px;
            margin: 30px 0;
            padding: 20px;
            border-top: 1px solid #444;
            border-bottom: 1px solid #444;
          }
          .footer {
            background-color: #0a0a0a;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 2px solid #d4af37;
          }
          .alert {
            color: #ff6b6b;
            font-weight: bold;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="aquila">⚔</div>
            <div class="title">Imperial Security Division</div>
            <div style="color: #c0c0c0; font-size: 14px; margin-top: 10px;">
              CIPHER RESET AUTHORIZATION
            </div>
          </div>
          
          <div class="content">
            <div style="color: #d4af37; font-size: 20px; margin: 20px 0;">
              ⚠ SECURITY ALERT ⚠
            </div>
            
            <div class="message">
              <p><strong>Loyal Citizen of the Imperium,</strong></p>
              <p>A request has been received to reset your Vault-Throne security cipher.</p>
            </div>
            
            <div class="warning-box">
              <div class="alert">⚠ IMPORTANT SECURITY NOTICE ⚠</div>
              <p style="color: #c0c0c0; margin-top: 15px; font-size: 14px;">
                If you did not initiate this request, your account may be under threat.<br>
                Report this immediately to the Adeptus Arbites (Security Division).
              </p>
            </div>
            
            <div class="message">
              <p>To establish a new security cipher and regain access to your Vault-Throne, activate the authorization link below:</p>
            </div>
            
            <a href="${resetLink}" class="reset-button">
              ⚔ RESET CIPHER ⚔
            </a>
            
            <div class="decree">
              "The security of the Imperium rests upon the vigilance of its citizens. Guard your cipher as you would guard your life."
            </div>
            
            <div style="color: #888; font-size: 13px; margin-top: 20px;">
              This authorization link expires in 15 minutes by Imperial Standard Time.<br>
              For security purposes, this link may only be used once.
            </div>
          </div>
          
          <div class="footer">
            <div style="margin-bottom: 10px;">⚜ THE EMPEROR PROTECTS ⚜</div>
            <div>Imperial Vault-Throne Security Division</div>
            <div style="margin-top: 5px;">Protecting Imperial Assets since M41</div>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    logger.error('Send Reset email Error: %o', err);
  }
}

const { notificationMail } = require('./NotificationEmailTemplate');
const sendNotificationEmail = async (email, notification) => {
  const result = await transporter.sendMail(notificationMail(email, notification, process.env));
  if (!result.accepted?.length || result.rejected?.length) {
    const error = new Error('Notification email was not accepted');
    error.code = 'ERECIPIENT';
    throw error;
  }
  return result;
};

module.exports = { sendVerificationEmail, sendResetEmail, sendNotificationEmail };
