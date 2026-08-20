import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { ROUTES } from './api/_handlers.js'
import { DATA_ROUTES } from './api/_dataHandlers.js'

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
      // Third-party proxies (Buffer, Resend, Fathom, calendar) — POST only,
      // body only, no auth headers to check.
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

      // Auth + data routes — need the HTTP method (GET/PUT as well as POST)
      // and the request headers (Authorization: Bearer <session token>).
      Object.entries(DATA_ROUTES).forEach(([route, { method, handler }]) => {
        server.middlewares.use(route, async (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          // CORS — the Chrome extension talks to these routes directly from
          // a chrome-extension:// origin (same as production's per-file CORS
          // headers on auth-client/crm-lead/extension), and without this the
          // extension is only ever testable against production, never dev.
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
          if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
          if (method && req.method !== method) {
            res.statusCode = 405
            res.end(JSON.stringify({ error: `${method} only` }))
            return
          }
          let body = {}
          if (req.method === 'POST' || req.method === 'PUT') {
            let raw = ''
            for await (const chunk of req) raw += chunk
            try {
              body = JSON.parse(raw || '{}')
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON body.' }))
              return
            }
          }
          try {
            const { status, body: out } = await handler({ method: req.method, headers: req.headers, body })
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
