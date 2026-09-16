import { describe, expect, it } from 'vitest'
import { parseServerEnv } from './env'

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
