import nodemailer from 'nodemailer'

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  tlsRejectUnauthorized: boolean
  user?: string
  pass?: string
  from: string
}

function readSmtpConfig() {
  const host = process.env.SMTP_HOST
  const portRaw = process.env.SMTP_PORT || '587'
  const from = process.env.SMTP_FROM

  if (!host || !from) return null

  const port = Number.parseInt(portRaw, 10)
  if (Number.isNaN(port)) return null

  const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase()
  const secure = secureRaw
    ? secureRaw === 'true' || secureRaw === '1' || secureRaw === 'yes'
    : port === 465
  const tlsRejectUnauthorizedRaw = process.env.SMTP_TLS_REJECT_UNAUTHORIZED?.trim().toLowerCase()
  const tlsRejectUnauthorized =
    tlsRejectUnauthorizedRaw === 'false' || tlsRejectUnauthorizedRaw === '0'
      ? false
      : true

  return {
    host,
    port,
    secure,
    tlsRejectUnauthorized,
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

  const sendWithConfig = async (smtpConfig: SmtpConfig, forceRequireTls = false) => {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      requireTLS: forceRequireTls,
      auth: smtpConfig.user ? { user: smtpConfig.user, pass: smtpConfig.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      tls: {
        servername: smtpConfig.host,
        rejectUnauthorized: smtpConfig.tlsRejectUnauthorized,
      },
    })

    await transporter.sendMail({
      from: smtpConfig.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    })
  }

  try {
    await sendWithConfig(config)
  } catch (primaryError) {
    // Common production misconfig: port 587 + SMTPS secure mode. Retry with STARTTLS.
    if (config.secure && config.port === 587) {
      try {
        await sendWithConfig({ ...config, secure: false }, true)
        return
      } catch (fallbackError) {
        console.error('SMTP send failed on primary and fallback transport:', {
          primaryError,
          fallbackError,
        })
      }
    } else {
      console.error('SMTP send failed:', primaryError)
    }

    throw new Error('SMTP delivery failed. Verify SMTP host, port, secure mode, username and password.')
  }
}
