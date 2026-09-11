function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function inboxUrl(env) {
    const url = new URL('/notifications', env.CLIENT_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid CLIENT_URL');
    return url.toString();
}
function notificationMail(email, notification, env) {
    const title = ({ transfer: 'Transfer confirmed', security: 'Account security alert', membership: 'Vault access updated', dispute: 'Dispute updated' })[notification.type] || 'Imperial dispatch';
    const link = inboxUrl(env);
    return {
        from: env.EMAIL_USER,
        to: { address: email },
        subject: `Imperial Bank — ${title}`,
        messageId: `<notification-${notification.id}@imperial-bank.local>`,
        text: `ADEPTUS ADMINISTRATUM\n${title}\n\n${notification.message}\n\nView your transmissions: ${link}\n\nImperial Bank of Terra\nThe Emperor protects.`,
        html: `<!doctype html><html><body style="margin:0;background:#0c0d0e;color:#ede6d6;font-family:Georgia,serif"><table role="presentation" style="width:100%;padding:24px"><tr><td><table role="presentation" style="max-width:600px;width:100%;margin:auto;background:#141516;border:1px solid #c1a267;border-top:6px solid #941f2c"><tr><td style="padding:32px"><p style="font:12px Arial,sans-serif;letter-spacing:2px;color:#c1a267">ADEPTUS ADMINISTRATUM / ASTROPATHIC DISPATCH</p><h1 style="font-size:28px;color:#e0c48b">${title}</h1><p style="font:16px/1.7 Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(notification.message)}</p><p style="margin:32px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 24px;background:#941f2c;color:#fff;text-decoration:none;border:1px solid #c1a267;font:14px Arial,sans-serif">View your transmissions</a></p><p style="color:#a5a299;font:12px/1.6 Arial,sans-serif;border-top:1px solid #34322d;padding-top:20px">Imperial Bank of Terra<br>The Emperor protects.</p></td></tr></table></td></tr></table></body></html>`,
    };
}
module.exports = { notificationMail, inboxUrl };
