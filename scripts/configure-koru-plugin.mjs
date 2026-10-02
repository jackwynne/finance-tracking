import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const resource = process.argv[2];
if (!resource) throw new Error('Pass the public HTTPS Koru /mcp URL. No token is required.');
const url = new URL(resource);
if (url.protocol !== 'https:' || url.pathname !== '/mcp' || url.search || url.hash || url.username || url.password) {
  throw new Error('Use an HTTPS /mcp endpoint without credentials, query parameters or a fragment.');
}
const output = resolve(process.argv[3] ?? 'plugins/koru/mcp.json');
await writeFile(
  output,
  `${JSON.stringify(
    {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { koru: { type: 'streamable-http', url: url.href } },
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`Wrote public MCP configuration to ${output}\n`);
