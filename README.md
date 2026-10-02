# Koru

Personal spending and whole-portfolio exposure, with reviewed updates from ChatGPT outside the app. Start with the signed-in [Setup guide](http://localhost:3010/setup). ANZ NZ and CommBank Australia exports work without configuring a connection.

## Run locally

```sh
pnpm install
cp .env.local.example .env.local
pnpm dev
```

Keep existing `.env.local` values when resuming an installed app. Configure WorkOS AuthKit and Convex using the [Convex AuthKit instructions](https://docs.convex.dev/auth/authkit/). Use `http://localhost:3010/callback` for the redirect URI and port 3010 for the app homepage and permitted origins. Vite uses a strict port to keep these settings aligned.

## Your first review

1. Choose NZD or AUD and your reporting timezone in **Setup guide**.
2. Import account exports in **Imports**, checking duplicates and statement coverage before committing. Add dated balances in **Accounts** where needed.
3. Open **Spending**. Refresh published NZD/AUD rates for the selected month and comparison periods. Review incomplete coverage before treating a total as complete.
4. In **Updates**, download a review bundle. Give it to ChatGPT and ask for a proposals JSON file using the supplied contract. Upload the file, read the preview, then apply. Download the receipt; undo rechecks later edits.
5. In **Exposure**, enter dated statements for Smart holdings, Simplicity KiwiSaver, Hostplus and any other assets or debts. Use original currencies and total values before your ownership share. Bank balances appear automatically. Add official dated country, industry and asset-class breakdowns through a reviewed proposal.
6. Save monthly purchase emails as evidence in **Updates**, then give ChatGPT a copy. Resolve ambiguous purchases and statement cutoffs before confirming them. Applying a reviewed purchase proposal accepts the event; saving evidence alone does not. An undated screenshot does not establish a current valuation.

Jobs are atomic and bounded: at most 50 groups, 100 edits and 150 KB of proposal JSON. Larger tasks need separate reviewed jobs. Exports read all ledger pages; record revisions are rechecked on apply. The export is not a frozen database snapshot, so finish imports before downloading.

## Optional ANZ connection

Use an eligible Akahu personal app with **official ANZ bank-side consent for account information only**. Confirm eligibility using the [Akahu personal-app documentation](https://developers.akahu.nz/docs/personal-apps). If the official personal flow is unavailable, continue with file exports. CommBank stays file-based until an Australian provider is selected.

Set these **Convex server environment variables** in the intended deployment dashboard:

| Variable                       | Value                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| `AKAHU_APP_TOKEN`              | Personal app token                                                 |
| `AKAHU_USER_TOKEN`             | Personal user token for the authorized accounts                    |
| `AKAHU_OWNER_TOKEN_IDENTIFIER` | Existing Koru profile's `tokenIdentifier`, from the profiles table |

Do not put these tokens in `VITE_` variables, a review bundle, or ChatGPT. In **Updates**, confirm eligibility and read-only consent, enable Akahu, sync, map discovered ANZ accounts to existing accounts, then sync again. Review possible duplicates, changed amounts and missing records. Daily sync runs only for an enabled, configured owner. “Request bank refresh” requests asynchronous refresh; it does not guarantee immediately fresh data.

Disconnect in Koru to stop its jobs. Revoke the user token or bank consent in Akahu/ANZ separately. A failed sync keeps the previous data. Bank-only history currently has unknown period coverage; committed exports provide coverage evidence.

## Optional ChatGPT connection

The `/mcp` endpoint uses standard Streamable HTTP and WorkOS Connect OAuth. It offers Koru reads and proposals, plus separately granted, app-approved apply and undo. It contains no payment, withdrawal or brokerage trading tools.

1. Configure a [WorkOS Connect resource](https://workos.com/docs/connect) for the existing WorkOS application/users. Use the exact HTTP action endpoint `https://YOUR_DEPLOYMENT.convex.site/mcp` as the audience/resource indicator. Use OAuth authorization code flow with PKCE and the ChatGPT redirect URI supplied during registration.
2. Register scopes `koru.read`, `koru.propose` and optional `koru.apply`. Configure discovery, client registration and consent in WorkOS; do not use an AuthKit app-session token as a Connect access token.
3. Set server `MCP_AUTHORIZATION_SERVER_URL` to the AuthKit HTTPS origin, such as `https://YOUR_DOMAIN.authkit.app`, without a trailing slash. Set `MCP_RESOURCE_URL` to the exact HTTPS `/mcp` endpoint. The `.convex.cloud` URL is not the HTTP action URL.
4. Redeploy Convex and inspect `/.well-known/oauth-protected-resource` on the Convex site origin. Inspect `/.well-known/oauth-authorization-server` on the WorkOS issuer origin. An unauthenticated configured `/mcp` request must receive a bearer challenge.
5. Sign in to Koru and enable read/proposal access in **Updates**. This binds Connect's user identity to your existing profile. Enable apply separately if wanted.
6. Add the remote endpoint in ChatGPT developer mode and authorize with the same WorkOS user. Follow the current [ChatGPT connection instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt).
7. Test `get_review_context`, paginated `list_transactions`, and a staged proposal. Review the exact preview in Koru. Connected apply requires **Authorize connected ChatGPT** for that hash; undo requires a separate current undo approval. A chat message alone cannot grant either approval.

### Personal plugin

The repository includes `plugins/koru`, with a reusable finance-updates skill and a local marketplace entry. It works with review files before OAuth is configured. To bundle the remote server after setup:

```sh
node scripts/configure-koru-plugin.mjs https://YOUR_DEPLOYMENT.convex.site/mcp
```

This writes an ignored `plugins/koru/mcp.json` containing only the public URL. Restart the ChatGPT desktop app, choose **Koru personal** in its local plugin sources, and install the package when that surface supports repo marketplaces. For web ChatGPT, register the MCP connection directly; local marketplace availability varies by client. The package has not been installed or published by this implementation. See the current [plugin packaging instructions](https://developers.openai.com/plugins/build/plugins).

## Verify changes

```sh
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm exec convex dev --once
```

Check the configured deployment before running the last command. It deploys to the selected development environment; production deployment is separate. Tests use isolated Convex fixtures for preview/apply/undo, ownership, bank corrections, OAuth and MCP transport. They do not establish live ANZ consent or a successful ChatGPT OAuth session.

The [implementation record](docs/implementation/progress.md) tracks delivery. The [original plan](docs/improvement-plan.html) includes later optional fund-download automation, company overlap and performance reporting.
