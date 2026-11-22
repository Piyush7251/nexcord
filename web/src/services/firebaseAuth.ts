import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import type { ConfirmationResult, UserCredential } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: "AIzaSyDyJganFIQENC54aYmk28ZOp5QVdQ7Xee8",
  authDomain: "nexcord-42151.firebaseapp.com",
  projectId: "nexcord-42151",
  storageBucket: "nexcord-42151.firebasestorage.app",
  messagingSenderId: "316351856545",
  appId: "1:316351856545:web:08a34b52cef0f4131615e0",
  measurementId: "G-4M4ECCZQDG"
};

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);

let activeConfirmationResult: ConfirmationResult | null = null;
let activeRecaptchaVerifier: RecaptchaVerifier | null = null;

export async function sendFirebasePhoneOtp(phoneNumber: string, containerId = 'nc-recaptcha-container'): Promise<void> {
  // Ensure container exists in DOM
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
  }

  // Clear previous verifier if any
  if (activeRecaptchaVerifier) {
    try {
      activeRecaptchaVerifier.clear();
    } catch {
      // ignore
    }
    activeRecaptchaVerifier = null;
  }

  activeRecaptchaVerifier = new RecaptchaVerifier(firebaseAuth, containerId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved
    },
    'expired-callback': () => {
      if (activeRecaptchaVerifier) {
        try {
          activeRecaptchaVerifier.clear();
        } catch {
          // ignore
        }
        activeRecaptchaVerifier = null;
      }
    }
  });

  await activeRecaptchaVerifier.render();
  activeConfirmationResult = await signInWithPhoneNumber(firebaseAuth, phoneNumber, activeRecaptchaVerifier);
}

export async function verifyFirebasePhoneOtp(code: string): Promise<{ idToken: string; phoneNumber: string | null }> {
  if (!activeConfirmationResult) {
    throw new Error('No active verification session. Please request a new verification code.');
  }

  const credential: UserCredential = await activeConfirmationResult.confirm(code);
  const idToken = await credential.user.getIdToken();
  return {
    idToken,
    phoneNumber: credential.user.phoneNumber,
  };
}
