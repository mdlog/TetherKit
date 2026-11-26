import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Same setup as tether-deck: HTTPS for phone sensors + same-origin signaling proxy.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const https = env.DEV_HTTPS !== '0';
  const relay = { '/tether-signal': { target: env.RELAY_URL || 'http://localhost:8787', ws: true, changeOrigin: true } };
  // HTTPS tunnels for testing with a real phone (cloudflared / ngrok / Tailscale Funnel).
  // Add your own tunnel domain with DEV_ALLOWED_HOSTS=my.domain.com (comma-separated).
  const allowedHosts = [
    '.trycloudflare.com',
    '.ngrok-free.app',
    '.ngrok.app',
    '.ts.net',
    ...(env.DEV_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean),
  ];
  return {
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    server: { host: true, port: 5174, strictPort: true, proxy: relay, allowedHosts },
    preview: { host: true, port: 4174, strictPort: true, proxy: relay, allowedHosts },
    build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
  };
});
