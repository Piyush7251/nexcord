// Fast2SMS Delivery Engine for Nexcord Mobile OTP Verification

export async function sendSms({ phone, code }) {
  const cleanDigits = phone.replace(/\D/g, '');
  const indianMobile = cleanDigits.length === 12 && cleanDigits.startsWith('91')
    ? cleanDigits.slice(2)
    : cleanDigits.length === 10 ? cleanDigits : '';

  const results = {
    provider: 'Fast2SMS',
    deliveredToCarrier: false,
    details: '',
  };

  const fast2SmsKey = (process.env.FAST2SMS_API_KEY || '5kNcFJhtHIVtXGS87CJ0WpXkY8Ka1yUQP6rHCvsmowD3Sh4tTB4fHSMFXBEMltKyE3ZWQyaXjy6mPMAn').trim();

  if (fast2SmsKey && indianMobile) {
    // 1. Try Quick SMS API route (route: 'q') — enabled on Fast2SMS dashboard
    try {
      const qRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: fast2SmsKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'q',
          message: `Your Nexcord verification code is ${code}`,
          numbers: indianMobile,
        }),
      });

      const qData = await qRes.json();
      if (qData && qData.return) {
        console.log(`[Fast2SMS] Quick SMS successfully dispatched to ${indianMobile}:`, qData.message);
        results.deliveredToCarrier = true;
        results.details = `Delivered via Fast2SMS Quick SMS to ${phone}`;
        return results;
      }

      console.warn(`[Fast2SMS] Route 'q' response:`, qData?.message || qData);

      // 2. Try OTP route (route: 'otp') as secondary fallback
      const otpRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: fast2SmsKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: code,
          numbers: indianMobile,
        }),
      });

      const otpData = await otpRes.json();
      if (otpData && otpData.return) {
        console.log(`[Fast2SMS] OTP SMS successfully dispatched to ${indianMobile}:`, otpData.message);
        results.deliveredToCarrier = true;
        results.details = `Delivered via Fast2SMS OTP route to ${phone}`;
        return results;
      }

      console.warn(`[Fast2SMS] Route 'otp' response:`, otpData?.message || otpData);
      results.details = qData?.message || otpData?.message || 'Carrier dispatch pending';
    } catch (err) {
      console.warn(`[Fast2SMS] Network error:`, err.message);
      results.details = err.message;
    }
  } else if (!indianMobile) {
    results.details = `Non-standard Indian mobile format (${phone}). Expected 10-digit number.`;
  } else {
    results.details = 'FAST2SMS_API_KEY not configured.';
  }

  return results;
}
