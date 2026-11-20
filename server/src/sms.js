// Fast2SMS WhatsApp & Smart OTP Delivery Engine for Nexcord (₹0.25 / message)
// Completely removed the expensive Quick SMS route (₹7.00).

export async function sendSms({ phone, code }) {
  const cleanDigits = phone.replace(/\D/g, '');
  const indianMobile = cleanDigits.length === 12 && cleanDigits.startsWith('91')
    ? cleanDigits.slice(2)
    : cleanDigits.length === 10 ? cleanDigits : '';

  const results = {
    provider: 'Fast2SMS WhatsApp',
    deliveredToCarrier: false,
    details: '',
  };

  const fast2SmsKey = (process.env.FAST2SMS_API_KEY || '5kNcFJhtHIVtXGS87CJ0WpXkY8Ka1yUQP6rHCvsmowD3Sh4tTB4fHSMFXBEMltKyE3ZWQyaXjy6mPMAn').trim();
  const otpId = (process.env.FAST2SMS_OTP_ID || '').trim();

  if (!indianMobile) {
    results.details = `Invalid mobile number (${phone}). Expected 10-digit Indian number.`;
    return results;
  }

  // 1. Send via Fast2SMS Smart OTP (WhatsApp, ₹0.25 per message)
  if (fast2SmsKey && otpId) {
    try {
      const res = await fetch('https://www.fast2sms.com/dev/otp/send', {
        method: 'POST',
        headers: {
          authorization: fast2SmsKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mobile: indianMobile,
          otp_id: otpId,
          otp: code,
          otp_length: 6,
          otp_expiry: 10,
        }),
      });

      const data = await res.json();
      if (data && data.return) {
        console.log(`[Fast2SMS WhatsApp] Dispatched successfully to ${indianMobile}:`, data.message);
        results.deliveredToCarrier = true;
        results.details = `Delivered via Fast2SMS WhatsApp to ${phone}`;
        return results;
      }
      console.warn('[Fast2SMS WhatsApp] Smart OTP response:', data);
      results.details = data?.message || 'Fast2SMS WhatsApp dispatch error';
    } catch (err) {
      console.warn('[Fast2SMS WhatsApp] Network error:', err.message);
      results.details = err.message;
    }
  }

  // 2. Direct WhatsApp template endpoint fallback (if phone_number_id & message_id are provided)
  const phoneId = (process.env.FAST2SMS_WABA_PHONE_ID || '').trim();
  const messageId = (process.env.FAST2SMS_WABA_MESSAGE_ID || '').trim();
  if (fast2SmsKey && phoneId && messageId) {
    try {
      const url = `https://www.fast2sms.com/dev/whatsapp?message_id=${messageId}&phone_number_id=${phoneId}&numbers=${indianMobile}&variables_values=${code}`;
      const res = await fetch(url, {
        headers: { authorization: fast2SmsKey },
      });
      const data = await res.json();
      if (data && (data.status || data.return)) {
        console.log(`[Fast2SMS WhatsApp] Dispatched via WABA template to ${indianMobile}`);
        results.deliveredToCarrier = true;
        results.details = `Delivered via Fast2SMS WhatsApp to ${phone}`;
        return results;
      }
    } catch (err) {
      console.warn('[Fast2SMS WhatsApp WABA] error:', err.message);
    }
  }

  if (!otpId && !phoneId) {
    results.details = 'FAST2SMS_OTP_ID is required to send WhatsApp OTP on Fast2SMS.';
  }

  return results;
}
