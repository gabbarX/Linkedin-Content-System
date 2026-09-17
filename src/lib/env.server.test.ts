import { describe, expect, it } from 'vitest'
import { parseServerEnv } from './env.server'

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
}

describe('parseServerEnv', () => {
  it('returns a typed config when required vars are present', () => {
    const env = parseServerEnv(valid)
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-key')
  })

  it('names every missing variable in the error message', () => {
    expect(() => parseServerEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(() => parseServerEnv({})).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('rejects a non-URL Supabase URL', () => {
    expect(() =>
      parseServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('treats milestone keys as optional', () => {
    const env = parseServerEnv(valid)
    expect(env.OPENROUTER_API_KEY).toBeUndefined()
  })

  it('keeps optional keys when supplied', () => {
    const env = parseServerEnv({ ...valid, OPENROUTER_API_KEY: 'sk-or-1' })
    expect(env.OPENROUTER_API_KEY).toBe('sk-or-1')
  })

  // .env.example ships every not-yet-needed key as `KEY=`, and docs/ACCOUNTS.md
  // tells you to copy it. The optional-key test above passes only because it
  // omits those keys entirely -- a state the documented setup never produces.
  it('treats a blank optional key as absent, not as a too-short value', () => {
    const env = parseServerEnv({
      ...valid,
      OPENROUTER_API_KEY: '',
      RAZORPAY_SECRET: '',
      TOKEN_ENCRYPTION_KEY: '',
    })
    expect(env.OPENROUTER_API_KEY).toBeUndefined()
    expect(env.RAZORPAY_SECRET).toBeUndefined()
    expect(env.TOKEN_ENCRYPTION_KEY).toBeUndefined()
  })

  it('still rejects a blank required key, naming it', () => {
    expect(() =>
      parseServerEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: '' }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })
})


describe('parseServerEnv, Razorpay keys', () => {
  it('parses with no Razorpay key set, because the milestone is optional until it ships', () => {
    expect(parseServerEnv(valid).RAZORPAY_KEY).toBeUndefined()
  })

  it('reads a blank Razorpay key as unset rather than invalid', () => {
    const env = parseServerEnv({ ...valid, RAZORPAY_KEY: '', RAZORPAY_PLAN_ID: '' })
    expect(env.RAZORPAY_KEY).toBeUndefined()
    expect(env.RAZORPAY_PLAN_ID).toBeUndefined()
  })

  it('keeps all four Razorpay values when set', () => {
    const env = parseServerEnv({
      ...valid,
      RAZORPAY_KEY: 'rzp_test_x',
      RAZORPAY_SECRET: 'secret',
      RAZORPAY_PLAN_ID: 'plan_x',
      RAZORPAY_WEBHOOK_SECRET: 'whsec',
    })
    expect(env.RAZORPAY_KEY).toBe('rzp_test_x')
    expect(env.RAZORPAY_SECRET).toBe('secret')
    expect(env.RAZORPAY_PLAN_ID).toBe('plan_x')
    expect(env.RAZORPAY_WEBHOOK_SECRET).toBe('whsec')
  })

  it('names the offending variable when a URL is malformed', () => {
    expect(() => parseServerEnv({ ...valid, NEXT_PUBLIC_APP_URL: 'not-a-url' })).toThrow(
      /NEXT_PUBLIC_APP_URL/,
    )
  })
})
