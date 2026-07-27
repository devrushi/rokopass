import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Lets the dev server be reached through an ngrok tunnel (or similar) for sharing localhost
    // with a client — Vite blocks unrecognized Host headers by default as a DNS-rebinding
    // protection. The leading "." matches any subdomain, since ngrok's free tier assigns a new
    // random one each session.
    allowedHosts: ['.ngrok-free.app'],
  },
})
