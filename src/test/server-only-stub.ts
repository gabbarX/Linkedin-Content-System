/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * `server-only` is a module that throws the moment it is imported outside a
 * React Server Component. That is exactly what we want from Next's build, where
 * it stops a server module leaking into a client bundle — but Vitest runs plain
 * Node, so every module carrying the guard was untestable.
 *
 * Aliased in vitest.config.mts. This changes nothing about the build: Next
 * resolves the real package and still fails if a client component imports a
 * server module.
 */
export {}
