const BRAND_COLOR = '#60a5fa'
const BRAND_BG = '#0b0f1a'
const CARD_BG = '#131928'
const TEXT_COLOR = '#e2e8f0'
const MUTED_COLOR = '#94a3b8'

function baseLayout(content: string, footerText?: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text",Aptos,"Segoe UI",Roboto,sans-serif;color:${TEXT_COLOR};-webkit-text-size-adjust:100%}
  .wrapper{max-width:600px;margin:0 auto;padding:32px 16px}
  .card{background:${CARD_BG};border-radius:12px;border:1px solid #1e293b;overflow:hidden}
  .header{background:linear-gradient(135deg,#1e293b 0%,${CARD_BG} 100%);padding:24px 28px;border-bottom:1px solid #1e293b}
  .header-brand{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;color:${BRAND_COLOR};letter-spacing:0.5px;text-transform:uppercase}
  .header-brand svg{width:20px;height:20px}
  .body{padding:28px}
  .body h2{margin:0 0 8px;font-size:18px;font-weight:600;color:${TEXT_COLOR}}
  .body p{margin:0 0 16px;font-size:14px;line-height:1.6;color:${MUTED_COLOR}}
  .badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600;background:${BRAND_COLOR}1a;color:${BRAND_COLOR};border:1px solid ${BRAND_COLOR}33}
  .quote{margin:16px 0;padding:12px 16px;background:#1e293b;border-left:3px solid ${BRAND_COLOR};border-radius:0 8px 8px 0;font-size:13px;line-height:1.5;color:${TEXT_COLOR};white-space:pre-wrap}
  .cta{display:inline-block;margin:20px 0 4px;padding:10px 24px;background:${BRAND_COLOR};color:#0b0f1a;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px}
  .cta:hover{background:#93c5fd}
  .meta{margin:20px 0 0;padding:16px 0 0;border-top:1px solid #1e293b}
  .meta-row{display:flex;justify-content:space-between;font-size:12px;color:${MUTED_COLOR};margin-bottom:4px}
  .footer{padding:20px 28px;text-align:center;font-size:11px;color:#475569;border-top:1px solid #1e293b}
  .footer a{color:${BRAND_COLOR};text-decoration:none}
</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <div class="header-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="${BRAND_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        RabbitFlow
      </div>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      ${footerText || 'This is an automated notification from RabbitFlow. Please do not reply to this email.'}
    </div>
  </div>
</div>
</body>
</html>`
}

function escape(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildMentionEmail(args: {
  recipientName: string
  actorName: string
  issueKey: string
  issueTitle: string
  projectKey: string
  commentPreview: string
  actionUrl: string
}) {
  const subject = `[${escape(args.projectKey)}] ${escape(args.actorName)} mentioned you in ${escape(args.issueKey)}`

  const html = baseLayout(`
    <h2>${escape(args.actorName)} mentioned you</h2>
    <p>You were mentioned in a comment on work item <span class="badge">${escape(args.issueKey)}</span></p>
    <p style="color:${TEXT_COLOR};font-weight:500;margin-bottom:4px">${escape(args.issueTitle)}</p>
    ${args.commentPreview ? `<div class="quote">${escape(args.commentPreview)}</div>` : ''}
    <a href="${escape(args.actionUrl)}" class="cta">View Work Item</a>
    <div class="meta">
      <div class="meta-row"><span>Project</span><span>${escape(args.projectKey)}</span></div>
      <div class="meta-row"><span>Work Item</span><span>${escape(args.issueKey)}</span></div>
      <div class="meta-row"><span>By</span><span>${escape(args.actorName)}</span></div>
    </div>
  `)

  const text = [
    `${args.actorName} mentioned you in ${args.issueKey}: ${args.issueTitle}`,
    '',
    'Comment:',
    args.commentPreview,
    '',
    `Open work item: ${args.actionUrl}`,
  ].join('\n')

  return { subject, html, text }
}

export function buildAssignmentEmail(args: {
  assigneeName: string
  actorName: string
  issueKey: string
  issueTitle: string
  projectKey: string
  actionUrl: string
}) {
  const subject = `[${escape(args.projectKey)}] Assigned to you: ${escape(args.issueKey)}`

  const html = baseLayout(`
    <h2>Work item assigned to you</h2>
    <p><strong>${escape(args.actorName)}</strong> assigned you to work item <span class="badge">${escape(args.issueKey)}</span></p>
    <p style="color:${TEXT_COLOR};font-weight:500;margin-bottom:4px">${escape(args.issueTitle)}</p>
    <a href="${escape(args.actionUrl)}" class="cta">Open Work Item</a>
    <div class="meta">
      <div class="meta-row"><span>Project</span><span>${escape(args.projectKey)}</span></div>
      <div class="meta-row"><span>Work Item</span><span>${escape(args.issueKey)}</span></div>
      <div class="meta-row"><span>Assigned by</span><span>${escape(args.actorName)}</span></div>
    </div>
  `)

  const text = [
    `${args.actorName} assigned ${args.issueKey}: ${args.issueTitle} to you.`,
    '',
    `Open work item: ${args.actionUrl}`,
  ].join('\n')

  return { subject, html, text }
}

export function buildPasswordResetEmail(args: {
  userName: string
  otpCode: string
}) {
  const subject = 'RabbitFlow — Password Reset Code'

  const html = baseLayout(`
    <h2>Password Reset</h2>
    <p>Hi ${escape(args.userName)}, use the code below to reset your password. This code expires in 10 minutes.</p>
    <div style="margin:24px 0;text-align:center">
      <span style="display:inline-block;padding:14px 32px;background:#1e293b;border:2px dashed ${BRAND_COLOR}55;border-radius:10px;font-size:28px;font-weight:700;letter-spacing:6px;color:${TEXT_COLOR}">${escape(args.otpCode)}</span>
    </div>
    <p>If you didn't request a password reset, you can safely ignore this email.</p>
  `)

  const text = [
    `Hi ${args.userName},`,
    '',
    `Your password reset code is: ${args.otpCode}`,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this, please ignore this email.',
  ].join('\n')

  return { subject, html, text }
}

export function buildUserOnboardingEmail(args: {
  userName: string
  temporaryPassword: string
  loginUrl: string
  projectName?: string | null
}) {
  const subject = 'RabbitFlow — Your account is ready'
  const assignmentLine = args.projectName
    ? `<p>You have been added to <span class="badge">${escape(args.projectName)}</span>.</p>`
    : ''

  const html = baseLayout(`
    <h2>Your RabbitFlow account is ready</h2>
    <p>Hi ${escape(args.userName)}, your administrator created an account for you.</p>
    ${assignmentLine}
    <p>Use the temporary password below to sign in. You will be required to change it on first login.</p>
    <div style="margin:24px 0;text-align:center">
      <span style="display:inline-block;padding:14px 20px;background:#1e293b;border:1px solid ${BRAND_COLOR}33;border-radius:10px;font-size:20px;font-weight:700;letter-spacing:1px;color:${TEXT_COLOR}">${escape(args.temporaryPassword)}</span>
    </div>
    <a href="${escape(args.loginUrl)}" class="cta">Open RabbitFlow</a>
    <div class="meta">
      <div class="meta-row"><span>Password policy</span><span>Reset required on first login</span></div>
      <div class="meta-row"><span>Sign-in URL</span><span>RabbitFlow login</span></div>
    </div>
  `)

  const text = [
    `Hi ${args.userName},`,
    '',
    'Your RabbitFlow account is ready.',
    args.projectName ? `Assigned project: ${args.projectName}` : null,
    `Temporary password: ${args.temporaryPassword}`,
    'You will be required to change this password on first login.',
    '',
    `Login: ${args.loginUrl}`,
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, html, text }
}
