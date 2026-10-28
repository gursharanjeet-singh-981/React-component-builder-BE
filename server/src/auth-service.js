import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { errors, jwtVerify, SignJWT } from 'jose'

const scrypt = promisify(scryptCallback)
const passwordKeyLength = 64
const passwordCost = 32768
const passwordBlockSize = 8
const passwordParallelization = 1
const tokenLifetime = '1h'
const tokenIssuer = 'component-builder-api'
const tokenAudience = 'component-builder-api'
const textEncoder = new TextEncoder()

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || textEncoder.encode(secret).length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes.')
  }
  return textEncoder.encode(secret)
}

export function assertAuthConfiguration() {
  getJwtSecret()
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derivedKey = await scrypt(password, salt, passwordKeyLength, {
    N: passwordCost,
    r: passwordBlockSize,
    p: passwordParallelization,
    maxmem: 64 * 1024 * 1024,
  })

  return `scrypt$${passwordCost}$${passwordBlockSize}$${passwordParallelization}$${salt.toString('hex')}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password, passwordHash) {
  const parts = passwordHash.split('$')
  if (
    parts.length !== 6
    || parts[0] !== 'scrypt'
    || parts[1] !== String(passwordCost)
    || parts[2] !== String(passwordBlockSize)
    || parts[3] !== String(passwordParallelization)
    || !/^[\da-f]{32}$/i.test(parts[4])
    || !/^[\da-f]{128}$/i.test(parts[5])
  ) {
    throw new Error('Stored password hash has an invalid format.')
  }

  const salt = Buffer.from(parts[4], 'hex')
  const expectedKey = Buffer.from(parts[5], 'hex')
  const derivedKey = await scrypt(password, salt, passwordKeyLength, {
    N: passwordCost,
    r: passwordBlockSize,
    p: passwordParallelization,
    maxmem: 64 * 1024 * 1024,
  })

  return timingSafeEqual(expectedKey, derivedKey)
}

export async function createAccessToken(userId) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(tokenIssuer)
    .setAudience(tokenAudience)
    .setIssuedAt()
    .setExpirationTime(tokenLifetime)
    .sign(getJwtSecret())
}

export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: tokenIssuer,
      audience: tokenAudience,
    })
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return null
    }
    return payload.sub
  } catch (error) {
    if (error instanceof errors.JOSEError) {
      return null
    }
    throw error
  }
}
