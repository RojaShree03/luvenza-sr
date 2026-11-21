const nodemailer = require('nodemailer');

const sendEmail = async (options) => {

    // Create Gmail SMTP transporter
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    // Email configuration
    const mailOptions = {
        from: `"Luvenza Support" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        html: options.html
    };

    // Send email
    await transporter.sendMail(mailOptions);

};

module.exports = sendEmail;