import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DIRECT_URL })
await c.connect()
await c.query(`update public.profiles set onboarding_step=$1 where email=$2`, [process.argv[2], 'iamankitgautamxd+linkbudqa@gmail.com'])
console.table((await c.query(`select email, onboarding_step from public.profiles where email='iamankitgautamxd+linkbudqa@gmail.com'`)).rows)
await c.end()
