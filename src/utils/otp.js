const crypto = require('crypto');

function generateOtp(length = 6) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
}

// Placeholder for a real SMS gateway (MSG91 / Twilio / etc — pick whichever
// your target market's carriers support best). Wire the real provider call
// in here before going anywhere near production; until then this only logs.
async function sendOtpSms(mobile, otp) {
  console.log(`[OTP] Would send OTP ${otp} to ${mobile} (no SMS gateway configured yet)`);
  return true;
}

module.exports = { generateOtp, sendOtpSms };
