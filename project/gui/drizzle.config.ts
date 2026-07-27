import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/auth-schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.SWEAT_DATABASE_PATH ?? './sweat.sqlite',
  },
})
