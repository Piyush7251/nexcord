// Fast2SMS WhatsApp OTP Delivery Engine for Nexcord (₹0.25 / message)
// Automatically connects to your approved Fast2SMS WhatsApp Cloud API template.
import { addLog } from './logger.js';

let cachedWabaConfig = null;
let lastWabaFetchTime = 0;
let cachedWallet = null;
let lastWalletFetch = 0;
let dynamicApiKey = null;
let dynamicPhoneId = null;
let dynamicMessageId = null;
let mockSmsHandler = null;

export function setMockSmsHandler(handler) {
  mockSmsHandler = handler;
}

export async function getFast2SmsWalletBalance(apiKey) {
  const now = Date.now();
  if (cachedWallet !== null && (now - lastWalletFetch) < 30000) {
    return cachedWallet;
  }
  try {
    const res = await fetch('https://www.fast2sms.com/dev/wallet', {
      headers: { authorization: apiKey },
    });
    const data = await res.json();
    if (data && data.return) {
      cachedWallet = parseFloat(data.wallet || 0);
      lastWalletFetch = now;
      return cachedWallet;
    }
  } catch (err) {
    console.warn('[Fast2SMS] Wallet check failed:', err.message);
  }
  return cachedWallet !== null ? cachedWallet : 0;
}

export function setFast2SmsRuntime({ apiKey, phoneId, messageId }) {
  if (apiKey !== undefined) {
    dynamicApiKey = String(apiKey || '').trim();
    process.env.FAST2SMS_API_KEY = dynamicApiKey;
    cachedWabaConfig = null; // force re-fetch
  }
  if (phoneId !== undefined) {
    dynamicPhoneId = String(phoneId || '').trim();
    process.env.FAST2SMS_WABA_PHONE_ID = dynamicPhoneId;
  }
  if (messageId !== undefined) {
    dynamicMessageId = String(messageId || '').trim();
    process.env.FAST2SMS_WABA_MESSAGE_ID = dynamicMessageId;
  }
}

export function getFast2SmsRuntime() {
  const apiKey = dynamicApiKey || process.env.FAST2SMS_API_KEY || '5kNcFJhtHIVtXGS87CJ0WpXkY8Ka1yUQP6rHCvsmowD3Sh4tTB4fHSMFXBEMltKyE3ZWQyaXjy6mPMAn';
  const phoneId = dynamicPhoneId || process.env.FAST2SMS_WABA_PHONE_ID || '1454063874454915';
  const messageId = dynamicMessageId || process.env.FAST2SMS_WABA_MESSAGE_ID || '46101';
  return { apiKey: apiKey.trim(), phoneId: phoneId.trim(), messageId: messageId.trim() };
}

export async function checkFast2SmsLiveStatus(overrideKey = null) {
  const { apiKey: defaultKey, phoneId: defaultPhoneId } = getFast2SmsRuntime();
  const apiKey = (overrideKey || defaultKey).trim();

  if (!apiKey) {
    return {
      connected: false,
      error: 'Fast2SMS API Key is not configured',
      balance: '0.00',
      smsCount: 0,
      templates: [],
    };
  }

  const result = {
    connected: false,
    apiKeyPreview: `${apiKey.slice(0, 6)}••••••••••••${apiKey.slice(-6)}`,
    balance: '0.00',
    smsCount: 0,
    wabaId: '',
    phoneId: defaultPhoneId,
    verifiedName: '',
    templates: [],
    error: null,
  };

  try {
    // 1. Check wallet balance
    const wRes = await fetch('https://www.fast2sms.com/dev/wallet', {
      headers: { authorization: apiKey },
    });
    const wData = await wRes.json();
    if (wData && wData.return) {
      result.connected = true;
      result.balance = `₹${parseFloat(wData.wallet || 0).toFixed(2)}`;
      result.smsCount = wData.sms_count || 0;
    } else {
      result.error = wData?.message || 'Invalid Fast2SMS API key';
      return result;
    }

    // 2. Check WhatsApp templates
    const tRes = await fetch('https://www.fast2sms.com/dev/dlt_manager/whatsapp?type=template', {
      headers: { authorization: apiKey, 'Content-Type': 'application/json' },
    });
    const tData = await tRes.json();
    if (tData && tData.success && Array.isArray(tData.data) && tData.data.length > 0) {
      const waba = tData.data[0];
      result.wabaId = String(waba.waba_id || '');
      result.phoneId = String(waba.phone_number_id || defaultPhoneId);
      result.verifiedName = waba.verified_name || 'Nexcord';
      result.templates = (waba.templates || []).map((t) => ({
        messageId: t.message_id,
        templateId: t.template_id,
        name: t.template_name,
        category: t.category,
        status: t.status,
        language: t.language,
      }));
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

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

      // Look for any approved template
      const approved = templates.filter((t) => {
        const s = String(t.status || '').toLowerCase();
        return s === 'approved' || s === 'active' || s.startsWith('active');
      });
      const otpTpl = approved.find((t) => /nexcord|otp|verify|auth|code|login|access|welcome|notify|confirm|status|update|ref/i.test(t.template_name)) || approved[0];

      if (otpTpl) {
        cachedWabaConfig = {
          phoneId: String(otpTpl.phone_number_id || phoneId),
          messageId: String(otpTpl.message_id),
          templateName: otpTpl.template_name,
        };
        lastWabaFetchTime = now;
        addLog('success', 'FAST2SMS', `Connected to approved template '${otpTpl.template_name}' (ID: ${otpTpl.message_id})`);
        return cachedWabaConfig;
      }
    }
  } catch (e) {
    addLog('warn', 'FAST2SMS', `Failed to fetch template config: ${e.message}`);
  }

  return null;
}

export async function sendSms({ phone, code }) {
  if (mockSmsHandler || process.env.NODE_ENV === 'test' || process.env.MOCK_SMS === 'true') {
    if (mockSmsHandler) return await mockSmsHandler({ phone, code });
    return {
      provider: 'Fast2SMS WhatsApp (Mocked)',
      deliveredToCarrier: true,
      details: `Mocked delivery to ${phone}`,
    };
  }

  const cleanDigits = phone.replace(/\D/g, '');
  const indianMobile = cleanDigits.length === 12 && cleanDigits.startsWith('91')
    ? cleanDigits.slice(2)
    : cleanDigits.length === 10 ? cleanDigits : '';

  const results = {
    provider: 'Fast2SMS WhatsApp',
    deliveredToCarrier: false,
    details: '',
  };

  const { apiKey: fast2SmsKey, phoneId: defaultPhoneId, messageId: defaultMessageId } = getFast2SmsRuntime();
  let phoneId = defaultPhoneId;
  let messageId = defaultMessageId;

  if (!indianMobile) {
    results.details = `Invalid mobile number (${phone}). Expected 10-digit Indian number.`;
    addLog('warn', 'FAST2SMS', `Invalid mobile format: ${phone}`);
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

  // Safety floor check: never dispatch if balance < ₹0.25 (prevents overdraft/negative balance)
  const currentBalance = await getFast2SmsWalletBalance(fast2SmsKey);
  if (currentBalance < 0.25) {
    const reason = `Fast2SMS balance is exhausted (${currentBalance < 0 ? '-' : ''}₹${Math.abs(currentBalance).toFixed(2)}). Please recharge at fast2sms.com.`;
    addLog('warn', 'FAST2SMS', `Blocked outbound SMS to ${phone}: ${reason}`);
    results.details = reason;
    return results;
  }

  if (fast2SmsKey && messageId) {
    try {
      const url = `https://www.fast2sms.com/dev/whatsapp?message_id=${encodeURIComponent(messageId)}&phone_number_id=${encodeURIComponent(phoneId)}&numbers=${encodeURIComponent(indianMobile)}&variables_values=${encodeURIComponent(code)}`;
      const res = await fetch(url, {
        headers: { authorization: fast2SmsKey },
      });
      const data = await res.json();
      if (data && (data.return || data.status || data.message === 'Message sent successfully')) {
        addLog('success', 'FAST2SMS', `WhatsApp OTP dispatched to ${indianMobile} (MsgID: ${messageId})`);
        results.deliveredToCarrier = true;
        results.details = `Delivered via WhatsApp to ${phone}`;
        return results;
      }

      const errMsg = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message || data?.errors?.message_id?.[0] || 'Fast2SMS WhatsApp dispatch error');
      addLog('warn', 'FAST2SMS', `WhatsApp send rejected: ${errMsg}`);
      results.details = errMsg;
    } catch (err) {
      addLog('error', 'FAST2SMS', `Network error sending WhatsApp: ${err.message}`);
      results.details = err.message;
    }
  } else {
    results.details = 'Waiting for an approved WhatsApp Template in your Fast2SMS WhatsApp Manager.';
    addLog('info', 'FAST2SMS', `WhatsApp message queued (Templates currently pending approval)`);
  }

  return results;
}
