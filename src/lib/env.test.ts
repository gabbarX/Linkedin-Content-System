import { describe, expect, it } from 'vitest'
import { parsePublicEnv, parseServerEnv } from './env'

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
})

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
}

describe('parsePublicEnv', () => {
  it('returns the three public values when all are present', () => {
    const env = parsePublicEnv(validPublic)
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co')
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key')
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000')
  })

  it('names every missing variable in the error message', () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_APP_URL/)
  })

  it('names only the variable that is missing', () => {
    const missingAnonKey = {
      NEXT_PUBLIC_SUPABASE_URL: validPublic.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_APP_URL: validPublic.NEXT_PUBLIC_APP_URL,
    }
    expect(() => parsePublicEnv(missingAnonKey)).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    )
    expect(() => parsePublicEnv(missingAnonKey)).not.toThrow(
      /NEXT_PUBLIC_APP_URL/,
    )
  })

  it('rejects an empty anon key rather than accepting the ?? default', () => {
    expect(() =>
      parsePublicEnv({ ...validPublic, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('rejects a non-URL Supabase URL', () => {
    expect(() =>
      parsePublicEnv({ ...validPublic, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('ignores server-only keys', () => {
    const env = parsePublicEnv({
      ...validPublic,
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    })
    expect(Object.keys(env)).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
})
