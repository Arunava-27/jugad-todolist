// Thin wrapper around Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
// Uses plain fetch rather than their SDK — Node 20 has fetch built in, and
// this is the only email we ever send, so a dependency isn't worth it.
//
// If RESEND_API_KEY isn't set, sendInviteEmail logs and no-ops instead of
// throwing — invites still get created and are shareable as a link, email
// just doesn't go out. That keeps local dev and a not-yet-configured
// production deploy from hard-failing the invite flow.

import { APP_URL } from './appUrl.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Punchlist <onboarding@resend.dev>';

export async function sendInviteEmail({ to, inviterName, workspaceName, token }) {
  const link = `${APP_URL}/?invite=${token}`;

  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — skipping invite email to ${to}. Share this link directly instead: ${link}`);
    return { sent: false, link };
  }

  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 15px; color: #12182a;">
        <strong>${escapeHtml(inviterName)}</strong> invited you to join
        <strong>${escapeHtml(workspaceName)}</strong> on Punchlist.
      </p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background:#d9a02a;color:#241a02;font-weight:600;text-decoration:none;
          padding:10px 20px;border-radius:6px;display:inline-block;font-family:-apple-system,Segoe UI,sans-serif;">
          Accept invite
        </a>
      </p>
      <p style="font-size: 13px; color: #58657a;">
        Or paste this link into your browser: <br />
        <a href="${link}" style="color:#58657a;">${link}</a>
      </p>
      <p style="font-size: 12px; color: #8d99ac; margin-top: 32px;">
        This invite expires in 7 days. If you weren't expecting it, you can ignore this email.
      </p>
    </div>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject: `${inviterName} invited you to ${workspaceName} on Punchlist`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[email] Resend send failed (${res.status}): ${body}`);
    return { sent: false, link, error: body };
  }
  return { sent: true, link };
}

export async function sendVerificationEmail({ to, name, token }) {
  const link = `${APP_URL}/?verify=${token}`;

  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — skipping verification email to ${to}. Share this link directly instead: ${link}`);
    return { sent: false, link };
  }

  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 15px; color: #12182a;">
        Hi ${escapeHtml(name)}, confirm this is your email address to finish setting up your Punchlist account.
      </p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background:#d9a02a;color:#241a02;font-weight:600;text-decoration:none;
          padding:10px 20px;border-radius:6px;display:inline-block;font-family:-apple-system,Segoe UI,sans-serif;">
          Verify email
        </a>
      </p>
      <p style="font-size: 13px; color: #58657a;">
        Or paste this link into your browser: <br />
        <a href="${link}" style="color:#58657a;">${link}</a>
      </p>
      <p style="font-size: 12px; color: #8d99ac; margin-top: 32px;">
        This link expires in 24 hours. If you weren't expecting it, you can ignore this email.
      </p>
    </div>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject: 'Verify your email for Punchlist', html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[email] Resend send failed (${res.status}): ${body}`);
    return { sent: false, link, error: body };
  }
  return { sent: true, link };
}

// Deliberately never returns a distinguishable result for "account doesn't
// exist" vs. "email failed to send" — routes/auth.js's /password-reset/request
// always responds the same way either way, so this function's return value is
// used only for server-side logging, never echoed back to the caller (unlike
// sendInviteEmail's `link`, which the invites flow does return — an invite
// isn't a credential-recovery flow, so there's no enumeration risk there).
export async function sendPasswordResetEmail({ to, name, token }) {
  const link = `${APP_URL}/?reset=${token}`;

  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — skipping password reset email to ${to}. Share this link directly instead: ${link}`);
    return { sent: false, link };
  }

  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 15px; color: #12182a;">
        Hi ${escapeHtml(name)}, we received a request to reset your Punchlist password.
      </p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background:#d9a02a;color:#241a02;font-weight:600;text-decoration:none;
          padding:10px 20px;border-radius:6px;display:inline-block;font-family:-apple-system,Segoe UI,sans-serif;">
          Reset password
        </a>
      </p>
      <p style="font-size: 13px; color: #58657a;">
        Or paste this link into your browser: <br />
        <a href="${link}" style="color:#58657a;">${link}</a>
      </p>
      <p style="font-size: 12px; color: #8d99ac; margin-top: 32px;">
        This link expires in 1 hour. If you didn't request this, you can safely ignore this email —
        your password won't change unless you click the link above and choose a new one.
      </p>
    </div>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject: 'Reset your Punchlist password', html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[email] Resend send failed (${res.status}): ${body}`);
    return { sent: false, link, error: body };
  }
  return { sent: true, link };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
