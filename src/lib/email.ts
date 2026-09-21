import nodemailer from 'nodemailer'

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  requireTls: boolean
  ignoreTls: boolean
  tlsRejectUnauthorized: boolean
  user?: string
  pass?: string
  from: string
}

type SmtpTransportError = Error & {
  code?: string
  errno?: number
  syscall?: string
  hostname?: string
  command?: string
  response?: string
}

function asSmtpTransportError(error: unknown): SmtpTransportError | null {
  if (error instanceof Error) {
    return error as SmtpTransportError
  }

  return null
}

function isDnsResolutionError(error: SmtpTransportError | null) {
  if (!error) {
    return false
  }

  return error.code === 'EDNS' || error.code === 'EAI_AGAIN' || error.syscall === 'getaddrinfo'
}

function isAuthError(error: SmtpTransportError | null) {
  if (!error) {
    return false
  }

  return error.code === 'EAUTH'
}

/**
 * A relay refusing the *source address* rather than the credentials.
 *
 * Brevo answers `525 5.7.1 Unauthorized IP address` when its Authorised IPs
 * list does not contain the sending host. Nodemailer reports that as `EAUTH`,
 * so without this check the operator is told to "verify SMTP username and
 * password" — credentials that are perfectly correct — and the real cause,
 * an allow-list that does not include the server, is never mentioned.
 */
function isUnauthorizedSenderIpError(error: SmtpTransportError | null) {
  if (!error) {
    return false
  }

  const response = `${error.response ?? ''} ${error.message ?? ''}`.toLowerCase()

  return (
    response.includes('unauthorized ip') ||
    response.includes('unauthorised ip') ||
    response.includes('525 5.7.1')
  )
}

/** Shared parsing so every SMTP boolean accepts the same spellings. */
function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback

  if (raw === 'true' || raw === '1' || raw === 'yes') return true
  if (raw === 'false' || raw === '0' || raw === 'no') return false

  return fallback
}

function readSmtpConfig() {
  const host = process.env.SMTP_HOST
  const portRaw = process.env.SMTP_PORT || '587'
  const from = process.env.SMTP_FROM

  if (!host || !from) return null

  const port = Number.parseInt(portRaw, 10)
  if (Number.isNaN(port)) return null

  // Implicit TLS is a property of the port: 465 speaks TLS from the first byte,
  // 587 starts in clear text and upgrades with STARTTLS. Default from the port
  // when nothing is configured.
  const secure = readBooleanEnv('SMTP_SECURE', port === 465)

  /*
    `SMTP_REQUIRE_TLS` and `SMTP_IGNORE_TLS` were set in every environment file
    and read by nothing — the transport was always built with
    `requireTLS: false`. On a STARTTLS port that means a relay which quietly
    declines to upgrade gets the credentials in clear text instead of failing.

    Default to requiring the upgrade whenever the connection is not already
    implicitly encrypted, which is what those files were asking for.
  */
  const requireTls = readBooleanEnv('SMTP_REQUIRE_TLS', !secure)
  const ignoreTls = readBooleanEnv('SMTP_IGNORE_TLS', false)

  const tlsRejectUnauthorized = readBooleanEnv('SMTP_TLS_REJECT_UNAUTHORIZED', true)

  // A configuration that cannot work: a TLS handshake against a STARTTLS port
  // fails with "wrong version number". `sendEmail` retries such a config with
  // STARTTLS so mail still goes out, but the setting is wrong and saying so
  // once is cheaper than leaving someone to find it in a packet trace.
  if (secure && port === 587) {
    console.warn(
      'SMTP_SECURE=true with SMTP_PORT=587: port 587 uses STARTTLS, not implicit TLS. ' +
        'Set SMTP_SECURE=false for port 587, or SMTP_PORT=465 to keep implicit TLS.'
    )
  }

  return {
    host,
    port,
    secure,
    requireTls,
    ignoreTls,
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
      requireTLS: forceRequireTls || smtpConfig.requireTls,
      ignoreTLS: smtpConfig.ignoreTls,
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
    let finalError = asSmtpTransportError(primaryError)

    // Common production misconfig: port 587 + SMTPS secure mode. Retry with STARTTLS.
    if (config.secure && config.port === 587) {
      try {
        await sendWithConfig({ ...config, secure: false }, true)
        return
      } catch (fallbackError) {
        finalError = asSmtpTransportError(fallbackError) ?? finalError
        console.error('SMTP send failed on primary and fallback transport:', {
          primaryError,
          fallbackError,
        })
      }
    } else {
      console.error('SMTP send failed:', primaryError)
    }

    /*
      Log what the relay actually said before mapping it to a summary. The
      summaries alone sent us hunting for a credential fault when the relay was
      refusing the server's IP address, which no amount of checking the username
      would have revealed.
    */
    console.error('SMTP delivery failed:', {
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTls: config.requireTls,
      code: finalError?.code,
      command: finalError?.command,
      response: finalError?.response,
      message: finalError?.message,
    })

    if (isDnsResolutionError(finalError)) {
      throw new Error(
        `SMTP host \"${config.host}\" could not be resolved from the application runtime. Check container DNS and outbound network access.`
      )
    }

    // Checked before the generic auth case: the relay reports this as EAUTH, but
    // the credentials are fine and only the source address is the problem.
    if (isUnauthorizedSenderIpError(finalError)) {
      throw new Error(
        `SMTP relay \"${config.host}\" rejected this server's IP address, not its credentials. ` +
          'Add the host\'s public IP to the provider\'s authorised-IP list, or disable that restriction.'
      )
    }

    if (isAuthError(finalError)) {
      throw new Error('SMTP authentication failed. Verify SMTP username and password.')
    }

    throw new Error('SMTP delivery failed. Verify SMTP host, port, secure mode, username and password.')
  }
}
