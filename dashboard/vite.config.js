import { defineConfig } from 'vite';

export default defineConfig({
    envDir: '../../..',
    server: {
        host: '0.0.0.0',
        allowedHosts: ['datacenter'],
        proxy: {
            '/v1': {
                target: 'https://echopoint.ujjwalvivek.com',
                changeOrigin: true,
            },
        },
    },
});
