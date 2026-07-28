import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = async (
  command: string[],
  env: Record<string, string>,
): Promise<string> => {
  const child = Bun.spawn(command, {
    cwd: import.meta.dir + '/../..',
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(stderr || stdout)
  return stdout
}

test('migrations persist Better Auth sessions across processes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-auth-'))
  const databasePath = join(directory, 'auth.sqlite')
  const env = {
    ...process.env,
    SWEAT_DATABASE_PATH: databasePath,
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-test-secret',
  } as Record<string, string>
  try {
    await run(['bun', 'run', 'src/server/migrate.ts'], env)
    const signedUp = JSON.parse(
      await run(
        [
          'bun',
          '-e',
          `
      const { auth } = await import('./src/lib/auth.ts');
      const created = await auth.api.createUser({
        body: {
          name: 'Test',
          email: 'test@example.com',
          password: 'safe-password',
          data: { username: 'tester', displayUsername: 'tester' },
        },
      });
      const response = await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'safe-password' }),
      }));
      const usernameResponse = await auth.api.signInUsername({
        body: { username: 'tester', password: 'safe-password' },
        asResponse: true,
      });
      process.stdout.write(JSON.stringify({ created: created.user.username, status: response.status, usernameStatus: usernameResponse.status, cookie: response.headers.get('set-cookie')?.split(';')[0] }));
    `,
        ],
        env,
      ),
    ) as {
      created: string
      status: number
      usernameStatus: number
      cookie?: string
    }
    expect(signedUp.created).toBe('tester')
    expect(signedUp.status).toBe(200)
    expect(signedUp.usernameStatus).toBe(200)
    expect(signedUp.cookie).toBeTruthy()
    await run(
      [
        'bun',
        '-e',
        `
      const { auth } = await import('./src/lib/auth.ts');
      const session = await auth.api.getSession({ headers: new Headers({ cookie: process.env.AUTH_COOKIE }) });
      if (!session?.user) process.exit(1);
    `,
      ],
      { ...env, AUTH_COOKIE: signedUp.cookie! },
    )
    const immutable = JSON.parse(
      await run(
        [
          'bun',
          '-e',
          `
      const { auth } = await import('./src/lib/auth.ts');
      const response = await auth.handler(new Request('http://localhost:3001/api/auth/update-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: process.env.AUTH_COOKIE, origin: 'http://localhost:3000' },
        body: JSON.stringify({ username: 'renamed' }),
      }));
      process.stdout.write(JSON.stringify({ status: response.status, body: await response.json() }));
    `,
        ],
        { ...env, AUTH_COOKIE: signedUp.cookie! },
      ),
    ) as { status: number; body: { code?: string } }
    expect(immutable.status).toBe(400)
    expect(immutable.body.code).toBe('USERNAME_IMMUTABLE')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('migrations seed the General room', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-room-'))
  const databasePath = join(directory, 'room.sqlite')
  const env = { ...process.env, SWEAT_DATABASE_PATH: databasePath } as Record<
    string,
    string
  >
  try {
    await run(['bun', 'run', 'src/server/migrate.ts'], env)
    const result = await run(
      [
        'bun',
        '-e',
        `
      const { Database } = await import('bun:sqlite');
      const database = new Database(process.env.SWEAT_DATABASE_PATH, { readonly: true });
      process.stdout.write(JSON.stringify(database.query("SELECT id, name FROM room").all()));
    `,
      ],
      env,
    )
    expect(JSON.parse(result)).toEqual([{ id: 'general', name: 'General' }])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('seed script creates two reusable local accounts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-seed-'))
  const databasePath = join(directory, 'seed.sqlite')
  const env = {
    ...process.env,
    SWEAT_DATABASE_PATH: databasePath,
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-test-secret',
    SWEAT_ADMIN_USERNAME: 'captain',
    SWEAT_MEMBER_USERNAME: 'builder',
  } as Record<string, string>
  try {
    await run(['bun', 'run', 'src/server/migrate.ts'], env)
    await run(['bun', 'run', 'src/server/seed-admin.ts'], env)
    await run(['bun', 'run', 'src/server/seed-admin.ts'], env)
    const result = await run(
      [
        'bun',
        '-e',
        `
      const { auth } = await import('./src/lib/auth.ts');
      const users = ['admin@sweat.local', 'teammate@sweat.local'];
      const statuses = await Promise.all(users.map(async (email) => {
        const response = await auth.handler(new Request('http://localhost:3001/api/auth/sign-in/email', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: 'change-me-now' }),
        }));
        const account = await (await auth.$context).internalAdapter.findUserByEmail(email);
        return { status: response.status, username: account?.user.username, role: account?.user.role };
      }));
      process.stdout.write(JSON.stringify(statuses));
    `,
      ],
      env,
    )
    expect(JSON.parse(result)).toEqual([
      { status: 200, username: 'captain', role: 'admin' },
      { status: 200, username: 'builder', role: 'user' },
    ])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('administrator recovery hashes the password and revokes sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-recovery-'))
  const databasePath = join(directory, 'recovery.sqlite')
  const env = {
    ...process.env,
    SWEAT_DATABASE_PATH: databasePath,
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-test-secret',
  } as Record<string, string>
  try {
    await run(['bun', 'run', 'src/server/migrate.ts'], env)
    await run(['bun', 'run', 'src/server/seed-admin.ts'], env)
    const cookie = await run(
      [
        'bun',
        '-e',
        `
      const { auth } = await import('./src/lib/auth.ts');
      const response = await auth.api.signInEmail({
        body: { email: 'admin@sweat.local', password: 'change-me-now' },
        asResponse: true,
      });
      process.stdout.write(response.headers.get('set-cookie')?.split(';')[0] ?? '');
    `,
      ],
      env,
    )
    await run(['bun', 'run', 'src/server/reset-admin-password.ts'], {
      ...env,
      SWEAT_NEW_ADMIN_PASSWORD: 'recovered-password',
    })
    const result = JSON.parse(
      await run(
        [
          'bun',
          '-e',
          `
      const { auth } = await import('./src/lib/auth.ts');
      const oldSession = await auth.api.getSession({ headers: new Headers({ cookie: process.env.AUTH_COOKIE }) });
      const response = await auth.api.signInEmail({
        body: { email: 'admin@sweat.local', password: 'recovered-password' },
        asResponse: true,
      });
      process.stdout.write(JSON.stringify({ oldSession: Boolean(oldSession), status: response.status }));
    `,
        ],
        { ...env, AUTH_COOKIE: cookie },
      ),
    ) as { oldSession: boolean; status: number }
    expect(result).toEqual({ oldSession: false, status: 200 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
