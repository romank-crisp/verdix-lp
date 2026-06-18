const RECIPIENT_EMAIL = 'kabazoo@gmail.com';
const FALLBACK_FROM_EMAIL = 'Verdix <onboarding@resend.dev>';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const phonePattern = /^[+]?[\d\s().-]{7,24}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateLead(data) {
  const source = data && typeof data === 'object' ? data : {};
  const lead = {
    name: clean(source.name),
    email: clean(source.email),
    phone: clean(source.phone),
    privacyConsent: source.privacyConsent === true,
    consentText: clean(source.consentText),
  };

  if (lead.name.length < 2) {
    return { error: 'Please enter your name.' };
  }
  if (!emailPattern.test(lead.email)) {
    return { error: 'Please enter a valid business email.' };
  }

  const digits = lead.phone.replace(/\D/g, '');
  if (!phonePattern.test(lead.phone) || digits.length < 7 || digits.length > 15) {
    return { error: 'Please enter a valid phone number.' };
  }
  if (!lead.privacyConsent) {
    return { error: 'Please confirm consent before submitting.' };
  }

  return { lead };
}

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY) {
    return json({ error: 'Email service is not configured yet.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid form submission.' }, 400);
  }

  const result = validateLead(payload);
  if (result.error) {
    return json({ error: result.error }, 400);
  }

  const { lead } = result;
  const from = env.FROM_EMAIL || FALLBACK_FROM_EMAIL;
  const consentedAt = new Date().toISOString();
  const consentText = lead.consentText || 'User consented to Verdix processing their submitted contact details to respond to their inquiry.';
  const html = `
    <h1>New Verdix lead</h1>
    <p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>
    <p><strong>Business email:</strong> ${escapeHtml(lead.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(lead.phone)}</p>
    <p><strong>GDPR consent:</strong> Yes</p>
    <p><strong>Consent text:</strong> ${escapeHtml(consentText)}</p>
    <p><strong>Consented at:</strong> ${escapeHtml(consentedAt)}</p>
  `;
  const text = [
    'New Verdix lead',
    '',
    `Name: ${lead.name}`,
    `Business email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    'GDPR consent: Yes',
    `Consent text: ${consentText}`,
    `Consented at: ${consentedAt}`,
  ].join('\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: RECIPIENT_EMAIL,
      reply_to: lead.email,
      subject: `New Verdix interest from ${lead.name}`,
      html,
      text,
    }),
  });

  if (!response.ok) {
    return json({ error: 'Email could not be sent. Please try again.' }, 502);
  }

  return json({ ok: true });
}

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
