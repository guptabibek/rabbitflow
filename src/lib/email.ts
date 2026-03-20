import nodemailer from 'nodemailer'

function readSmtpConfig() {
  const host = process.env.SMTP_HOST
  const portRaw = process.env.SMTP_PORT || '587'
  const from = process.env.SMTP_FROM

  if (!host || !from) return null

  const port = Number.parseInt(portRaw, 10)
  if (Number.isNaN(port)) return null

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from,
  }
}

export function isSmtpConfigured() {
  return readSmtpConfig() !== null
}

export async function sendEmail(payload: {
  to: string
  subject: string
  text: string
  html?: string
}) {
  const config = readSmtpConfig()

  if (!config) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASS.')
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  })

  await transporter.sendMail({
    from: config.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  })
}
