import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DIRECT_URL })
await c.connect()
console.table((await c.query(`select razorpay_subscription_id, razorpay_plan_id, status, current_start, current_end, cancel_at_cycle_end, last_event_at from public.subscriptions`)).rows)
console.table((await c.query(`select email, onboarding_step from public.profiles`)).rows)
await c.end()
