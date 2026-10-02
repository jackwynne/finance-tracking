import { httpRouter } from 'convex/server';

import { httpAction } from './_generated/server';
import { handleMcp, resourceMetadata } from './mcpServer';

const http = httpRouter();
http.route({
  path: '/.well-known/oauth-protected-resource',
  method: 'GET',
  handler: httpAction(() => {
    const metadata = resourceMetadata();
    return Promise.resolve(
      Response.json(metadata ?? { error: 'MCP OAuth is not configured.' }, { status: metadata ? 200 : 503 }),
    );
  }),
});
http.route({
  path: '/.well-known/oauth-protected-resource/mcp',
  method: 'GET',
  handler: httpAction(() => {
    const metadata = resourceMetadata();
    return Promise.resolve(
      Response.json(metadata ?? { error: 'MCP OAuth is not configured.' }, { status: metadata ? 200 : 503 }),
    );
  }),
});
const mcp = httpAction(handleMcp);
http.route({ path: '/mcp', method: 'POST', handler: mcp });
http.route({ path: '/mcp', method: 'GET', handler: mcp });
http.route({ path: '/mcp', method: 'DELETE', handler: mcp });
export default http;
