
require('dotenv').config();

const sendEmail = require('./utils/sendEmail');

const testEmail = async () => {
    try {
        await sendEmail({
            email: process.env.EMAIL_USER,
            subject: 'Luvenza SMTP Test',
            html: '<h2>Welcome to Luvenza!</h2><p>Gmail SMTP is working successfully.</p>'
        });

        console.log('Test email sent successfully!');

    } catch (error) {
        console.error('Email sending failed:', error.message);
    }
};

testEmail();