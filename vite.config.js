import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { ROUTES } from './api/_handlers.js'

// Mounts the same handlers Vercel serves from /api/*, so `npm run dev` behaves
// like production without needing `vercel dev`.
//
// loadEnv with an empty prefix reads unprefixed vars (BUFFER_API_KEY etc) into
// this Node process only — they never reach import.meta.env, which is exactly
// the point: secrets stay server-side.
function apiDevServer(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    name: 'eden-api-dev',
    configureServer(server) {
      Object.entries(ROUTES).forEach(([route, handler]) => {
        server.middlewares.use(route, async (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end(JSON.stringify({ error: 'POST only' }))
            return
          }
          let raw = ''
          for await (const chunk of req) raw += chunk
          let body
          try {
            body = JSON.parse(raw || '{}')
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid JSON body.' }))
            return
          }
          try {
            const { status, body: out } = await handler(body)
            res.statusCode = status
            res.end(JSON.stringify(out))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e.message }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), apiDevServer(mode)],
}))
