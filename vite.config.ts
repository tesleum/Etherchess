
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Use the provided key from the prompt for Gemini 3 Flash Preview
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || "AIzaSyClKrkud_cyOtL1rUgYy7yHv9LH_nJ4k7U"),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || "AIzaSyClKrkud_cyOtL1rUgYy7yHv9LH_nJ4k7U"),
        'process.env.TELEGRAM_BOT_TOKEN': JSON.stringify("8358429211:AAFJuK1PpDKPexyDN-f_eY2UPvzIPwWTX8M")
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
