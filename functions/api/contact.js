const RECIPIENT_EMAIL = 'info@verdix.ch';
const FALLBACK_FROM_EMAIL = 'Verdix <hello@updates.verdix.ch>';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
    comment: clean(source.comment),
    privacyConsent: source.privacyConsent === true,
    consentText: clean(source.consentText),
  };

  if (lead.name.length < 2) {
    return { error: 'Please enter your name.' };
  }
  if (!emailPattern.test(lead.email)) {
    return { error: 'Please enter a valid business email.' };
  }

  if (lead.comment.length < 2) {
    return { error: 'Please enter a comment.' };
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
    <p><strong>Comment:</strong> ${escapeHtml(lead.comment)}</p>
    <p><strong>GDPR consent:</strong> Yes</p>
    <p><strong>Consent text:</strong> ${escapeHtml(consentText)}</p>
    <p><strong>Consented at:</strong> ${escapeHtml(consentedAt)}</p>
  `;
  const text = [
    'New Verdix lead',
    '',
    `Name: ${lead.name}`,
    `Business email: ${lead.email}`,
    `Comment: ${lead.comment}`,
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
