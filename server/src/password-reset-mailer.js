import nodemailer from 'nodemailer'
import { ApiError } from './api-utils.js'

function getEmailSettings() {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const password = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM?.trim()
  const appBaseUrl = process.env.APP_BASE_URL?.trim()
  const port = Number(process.env.SMTP_PORT || 587)
  const secureSetting = process.env.SMTP_SECURE || 'false'

  if (!host || !user || !password || !from || !appBaseUrl) {
    throw new ApiError(
      503,
      'EMAIL_NOT_CONFIGURED',
      'No Password reset email is not configured on the server.',
    )
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'SMTP_PORT must be a valid port number.')
  }
  if (!['true', 'false'].includes(secureSetting)) {
    throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'SMTP_SECURE must be true or false.')
  }

  let appUrl
  try {
    appUrl = new URL(appBaseUrl)
  } catch {
    throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'APP_BASE_URL must be a valid HTTP or HTTPS URL.')
  }
  if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.username || appUrl.password) {
    throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'APP_BASE_URL must be a valid HTTP or HTTPS URL.')
  }

  return {
    host,
    port,
    secure: secureSetting === 'true',
    user,
    password,
    from,
    appOrigin: appUrl.origin,
  }
}

export function assertPasswordResetEmailConfiguration() {
  getEmailSettings()
}

export async function sendPasswordResetEmail(to, token) {
  const settings = getEmailSettings()
  const resetUrl = new URL('/reset-password', settings.appOrigin)
  resetUrl.searchParams.set('token', token)

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user, pass: settings.password },
  })

  try {
    await transporter.sendMail({
      from: settings.from,
      to,
      subject: 'Reset your Compify password',
      text: [
        'We received a request to reset your Compify password.',
        `Use this link within 30 minutes: ${resetUrl}`,
        'If you did not request a password reset, you can ignore this email.',
      ].join('\n\n'),
      html: `<p>We received a request to reset your Compify password.</p><p><a class="link" href="${resetUrl}">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request a password reset, you can ignore this email.</p>`,
    })
  } finally {
    transporter.close()
  }
}
