try { process.loadEnvFile('.env') } catch {}
const key = process.env.OPENROUTER_API_KEY
const jsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['formality','povStrength','openerPatterns'],
  properties: {
    formality: { type: 'string', enum: ['formal','conversational','casual'] },
    povStrength: { type: 'string', enum: ['measured','balanced','contrarian'] },
    openerPatterns: { type: 'array', items: { type: 'string' } },
  },
}
const models = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nex-agi/nex-n2.5-pro:free',
  'dots-studio/dots-3-note-preview:free',
  'nex-agi/nex-n2.5-mini:free',
]
const sys = 'You analyse writing voice. openerPatterns must describe the KIND of opening, never quote the text.'
const usr = 'Most coaches lose deals in the follow-up, not the pitch.\nI watched a client double their close rate by deleting one sentence.'
for (const model of models) {
  let ok = 0, notes = []
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model,
        response_format: { type: 'json_schema', json_schema: { name: 'voice', strict: true, schema: jsonSchema } },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }] }),
    })
    if (!res.ok) { notes.push('HTTP ' + res.status + ' ' + (await res.text()).slice(0,80)); continue }
    const b = await res.json()
    const c = b.choices?.[0]?.message?.content ?? ''
    try {
      const p = JSON.parse(c)
      const valid = ['formal','conversational','casual'].includes(p.formality)
        && ['measured','balanced','contrarian'].includes(p.povStrength)
      if (valid) ok++
      notes.push(`${Date.now()-t0}ms ${valid?'VALID':'INVALID'} ${JSON.stringify(p).slice(0,110)}`)
    } catch { notes.push('unparseable: ' + c.slice(0,80)) }
  }
  console.log(`\n=== ${model} — ${ok}/3 valid ===`)
  notes.forEach(n => console.log('  ' + n))
}
