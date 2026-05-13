const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Zoho SMTP Settings
  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.in', // Zoho India SMTP
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_EMAIL, // Your super-admin email
      pass: process.env.SMTP_PASSWORD, // Your App Password
    },
  });

  const message = {
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`, // Use noreply alias here
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html, // Support HTML emails
  };

  const info = await transporter.sendMail(message);

  console.log('Message sent: %s', info.messageId);
};

module.exports = sendEmail;
