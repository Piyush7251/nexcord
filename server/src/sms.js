// Fast2SMS WhatsApp OTP Delivery Engine for Nexcord (₹0.25 / message)
// Automatically connects to your approved Fast2SMS WhatsApp Cloud API template.

let cachedWabaConfig = null;
let lastWabaFetchTime = 0;

async function getWabaConfig(apiKey) {
  const now = Date.now();
  if (cachedWabaConfig && (now - lastWabaFetchTime) < 60000) {
    return cachedWabaConfig;
  }

  try {
    const res = await fetch('https://www.fast2sms.com/dev/dlt_manager/whatsapp?type=template', {
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json',
      },
    });
    const json = await res.json();
    if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
      const waba = json.data[0];
      const phoneId = String(waba.phone_number_id || '');
      const templates = Array.isArray(waba.templates) ? waba.templates : [];

      // Look for any approved template (preferring ones with 'otp', 'verify', 'auth', 'login', 'access', or 'welcome' in name)
      const approved = templates.filter((t) => String(t.status || '').toLowerCase() === 'approved');
      const otpTpl = approved.find((t) => /otp|verify|auth|code|login|access|welcome/i.test(t.template_name)) || approved[0];

      if (otpTpl) {
        cachedWabaConfig = {
          phoneId: String(otpTpl.phone_number_id || phoneId),
          messageId: String(otpTpl.message_id),
          templateName: otpTpl.template_name,
        };
        lastWabaFetchTime = now;
        console.log(`[Fast2SMS WhatsApp] Connected to approved template '${otpTpl.template_name}' (ID: ${otpTpl.message_id})`);
        return cachedWabaConfig;
      }
    }
  } catch (e) {
    console.warn('[Fast2SMS WhatsApp] Failed to fetch template config:', e.message);
  }

  return null;
}

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
  let phoneId = (process.env.FAST2SMS_WABA_PHONE_ID || '1454063874454915').trim();
  let messageId = (process.env.FAST2SMS_WABA_MESSAGE_ID || '').trim();

  if (!indianMobile) {
    results.details = `Invalid mobile number (${phone}). Expected 10-digit Indian number.`;
    return results;
  }

  // Auto-detect approved WhatsApp template if not explicitly pinned in env
  if (!messageId) {
    const autoCfg = await getWabaConfig(fast2SmsKey);
    if (autoCfg) {
      phoneId = autoCfg.phoneId;
      messageId = autoCfg.messageId;
    }
  }

  if (fast2SmsKey && messageId) {
    try {
      const url = `https://www.fast2sms.com/dev/whatsapp?message_id=${encodeURIComponent(messageId)}&phone_number_id=${encodeURIComponent(phoneId)}&numbers=${encodeURIComponent(indianMobile)}&variables_values=${encodeURIComponent(code)}`;
      const res = await fetch(url, {
        headers: { authorization: fast2SmsKey },
      });
      const data = await res.json();
      if (data && (data.return || data.status || data.message === 'Message sent successfully')) {
        console.log(`[Fast2SMS WhatsApp] Successfully dispatched to ${indianMobile}:`, data);
        results.deliveredToCarrier = true;
        results.details = `Delivered via WhatsApp to ${phone}`;
        return results;
      }

      console.warn('[Fast2SMS WhatsApp] Error response:', data);
      results.details = data?.message || data?.errors?.message_id?.[0] || 'Fast2SMS WhatsApp dispatch error';
    } catch (err) {
      console.warn('[Fast2SMS WhatsApp] Network error:', err.message);
      results.details = err.message;
    }
  } else {
    results.details = 'Waiting for an approved WhatsApp Template in your Fast2SMS WhatsApp Manager.';
  }

  return results;
}
