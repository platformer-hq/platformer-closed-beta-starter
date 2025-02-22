import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  base: '/platformer-closed-beta-starter',
  plugins: [mkcert()],
});