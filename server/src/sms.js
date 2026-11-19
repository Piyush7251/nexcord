// Multi-provider SMS Engine for Nexcord
// Supports: Fast2SMS (India), Twilio (Global), Custom Webhook, and In-App Real-Time delivery.

export async function sendSms({ phone, code }) {
  // Keep SMS short and clean (< 35 chars) so mobile carrier DLT/spam filters deliver it instantly without rejection
  const message = `Your Nexcord code is ${code}`;
  const cleanDigits = phone.replace(/\D/g, '');
  const indianMobile = cleanDigits.length === 12 && cleanDigits.startsWith('91') 
    ? cleanDigits.slice(2) 
    : cleanDigits.length === 10 ? cleanDigits : '';

  const results = {
    provider: 'in-app-realtime',
    deliveredToCarrier: false,
    details: '',
  };

  // 1. Try Fast2SMS (Popular in India for instantaneous OTP delivery)
  const fast2SmsKey = process.env.FAST2SMS_API_KEY;
  if (fast2SmsKey && indianMobile) {
    try {
      const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': fast2SmsKey.trim(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: code,
          numbers: indianMobile,
        }),
      });
      const data = await res.json();
      if (data.return) {
        console.log(`[SMS Gateway] Fast2SMS dispatched successfully to ${indianMobile}:`, data.message);
        results.provider = 'Fast2SMS';
        results.deliveredToCarrier = true;
        results.details = `Delivered via Fast2SMS to ${phone}`;
        return results;
      } else {
        console.warn(`[SMS Gateway] Fast2SMS error:`, data.message);
      }
    } catch (err) {
      console.warn(`[SMS Gateway] Fast2SMS network error:`, err.message);
    }
  }

  // 2. Try Twilio (Global Carrier Delivery)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const params = new URLSearchParams({
        To: phone,
        From: twilioFrom,
        Body: message,
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const data = await res.json();
      if (data.sid) {
        console.log(`[SMS Gateway] Twilio SMS dispatched successfully (SID: ${data.sid}) to ${phone}`);
        results.provider = 'Twilio';
        results.deliveredToCarrier = true;
        results.details = `Delivered via Twilio to ${phone}`;
        return results;
      } else {
        console.warn(`[SMS Gateway] Twilio error:`, data.message || data);
      }
    } catch (err) {
      console.warn(`[SMS Gateway] Twilio network error:`, err.message);
    }
  }

  // 3. Try Android Phone SIM Gateway (Cloud first for instant delivery across Wi-Fi & 4G/5G mobile data)
  const targets = [];
  if (process.env.SMS_CLOUD_WEBHOOK_URL) {
    targets.push({ url: process.env.SMS_CLOUD_WEBHOOK_URL, auth: process.env.SMS_CLOUD_WEBHOOK_AUTH, name: 'Cloud' });
  }
  if (process.env.SMS_WEBHOOK_URL) {
    targets.push({ url: process.env.SMS_WEBHOOK_URL, auth: process.env.SMS_WEBHOOK_AUTH, name: 'Local Wi-Fi' });
  }

  for (const target of targets) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (target.auth) headers['Authorization'] = target.auth.trim();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(target.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumbers: [phone],
          message,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok || res.status === 200 || res.status === 201 || res.status === 202) {
        console.log(`[SMS Gateway] Dispatched to Android SIM Gateway (${target.url}) status: ${res.status}`);
        results.provider = 'Android SIM Gateway';
        results.deliveredToCarrier = true;
        results.details = `Delivered through Android SIM Gateway (${res.status})`;
        return results;
      } else {
        const errText = await res.text();
        console.warn(`[SMS Gateway] Android SIM Gateway returned status ${res.status}:`, errText);
      }
    } catch (err) {
      console.warn(`[SMS Gateway] Android SIM Gateway error for ${target.url}:`, err.message);
    }
  }

  // 4. Real-time In-App / Simulated Delivery
  results.details = `Instant real-time in-app delivery to ${phone}`;
  return results;
}
