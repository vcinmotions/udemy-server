const { sendVerificationOTP } = require('../controllers/auth.controller');

require('dotenv').config();

async function run() {
  try {
    await sendVerificationOTP(
      process.env.TEST_EMAIL || process.env.SMTP_USER,
      'SMTP Test User',
      '123456'
    );

    console.log('✅ OTP email sent successfully');
  } catch (error) {
    console.error('❌ Failed to send OTP email');
    console.error(error);
  }
}

run();