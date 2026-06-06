const { sendEmail } = require("../utils/email");

// Manually register your live variables into the system environment block
// process.env.SMTP_HOST = "us2.smtp.mailhostbox.com";
// process.env.SMTP_PORT = "587";
// process.env.SMTP_USER = "shobha@vcinmotions.com";
// process.env.SMTP_PASSWORD = "qTgFmHB6";
// process.env.SMTP_FROM = "shobha@vcinmotions.com";
// process.env.SMTP_FROM_NAME = "VC Inmotions";

// Load your updated email client file module directly

require('dotenv').config();

async function sendVerificationOTP(email, name, otp) {
  await sendEmail({
    to: email,
    subject: '🛡️ Verify your account',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333333;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4F46E5; margin: 0; font-size: 24px;">Account Verification</h2>
        </div>
        <p style="font-size: 16px; line-height: 1.5; color: #4B5563;">Hi ${name},</p>
        <p style="font-size: 16px; line-height: 1.5; color: #4B5563;">Thank you for registering! Please use the verification code below to complete your account setup:</p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1E1B4B; background-color: #EEF2F6; padding: 12px 24px; border-radius: 6px; border: 1px dashed #CBD5E1;">
            ${otp}
          </span>
        </div>
        <p style="font-size: 14px; color: #EF4444; margin-bottom: 24px; font-weight: 500;">
          ⏳ This code will expire in 10 minutes.
        </p>
        <hr style="border: 0; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="font-size: 12px; color: #9CA3AF; line-height: 1.5; margin: 0;">
          If you did not create an account, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Hi ${name},\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.`
  });
}

async function executeTestPipeline() {
  const TARGET_TEST_EMAIL = "shobhaechauhan@gmail.com";
  const MOCK_NAME = "Shobha Chauhan";
  const MOCK_OTP = "449102";

  console.log("🚀 Starting standalone raw socket SMTP execution tunnel...");
  console.log(`Connecting to: ${process.env.SMTP_HOST} via port ${process.env.SMTP_PORT}...`);

  try {
    // We explicitly await the test call here to observe errors instantly
    await sendVerificationOTP(TARGET_TEST_EMAIL, MOCK_NAME, MOCK_OTP);
    console.log("==================================================================");
    console.log("✅ SUCCESS: Socket pipeline executed completely. Check your inbox!");
    console.log("==================================================================");
  } catch (error) {
    console.log("==================================================================");
    console.error("❌ FAILURE: SMTP handshake transaction sequence crashed:");
    console.error(error.message || error);
    console.log("==================================================================");
  }
}

executeTestPipeline();