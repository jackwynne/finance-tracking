import type { AuthConfig } from 'convex/server';

const clientId = process.env.WORKOS_CLIENT_ID;
// Convex auth-config evaluation throws when an optional environment key is absent.
function optionalEnvironment(name: string): string | undefined {
  try {
    return process.env[name];
  } catch {
    return undefined;
  }
}
const mcpIssuer = optionalEnvironment('MCP_AUTHORIZATION_SERVER_URL');
const mcpResource = optionalEnvironment('MCP_RESOURCE_URL');

export default {
  providers: [
    ...(mcpIssuer && mcpResource
      ? [
          {
            type: 'customJwt' as const,
            issuer: mcpIssuer,
            algorithm: 'RS256' as const,
            jwks: `${mcpIssuer}/oauth2/jwks`,
            applicationID: mcpResource,
          },
        ]
      : []),
    {
      type: 'customJwt',
      issuer: 'https://api.workos.com/',
      algorithm: 'RS256',
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: 'customJwt',
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: 'RS256',
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
} satisfies AuthConfig;
