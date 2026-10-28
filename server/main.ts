import { buildServer } from './index';

const port = Number(process.env.PORT ?? 8787);
const server = buildServer();

await server.listen({ host: '127.0.0.1', port });
console.log(`Ofrenda House server listening on http://127.0.0.1:${port}`);
