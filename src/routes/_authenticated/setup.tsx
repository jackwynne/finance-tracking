import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, PageHeading } from '@/features/finance/finance-ui';

import { api } from '../../../convex/_generated/api';

export const Route = createFileRoute('/_authenticated/setup')({ component: SetupPage });

function SetupPage() {
  const profile = useQuery(api.profiles.current);
  const readiness = useQuery(api.setup.readiness);
  const savePreferences = useMutation(api.setup.preferences);
  const [currency, setCurrency] = useState<'NZD' | 'AUD' | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await savePreferences({
        currency: currency ?? (profile?.baseCurrency === 'AUD' ? 'AUD' : 'NZD'),
        timezone: timezone ?? profile?.timezone ?? 'Pacific/Auckland',
      });
      toast.success('Reporting preferences saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Your routine"
        title="Setup guide"
        description="Start with your files and dated balances. Connect read-only services when their setup is ready."
      />
      <Card>
        <CardHeader>
          <CardTitle>1. Choose how to report</CardTitle>
          <CardDescription>Your original account currencies stay unchanged.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <label className="grid gap-2 text-sm">
            Reporting currency
            <NativeSelect
              value={currency ?? profile?.baseCurrency ?? 'NZD'}
              onChange={(event) => setCurrency(event.target.value === 'AUD' ? 'AUD' : 'NZD')}
            >
              <option value="NZD">NZD</option>
              <option value="AUD">AUD</option>
            </NativeSelect>
          </label>
          <label className="grid gap-2 text-sm">
            Reporting timezone
            <NativeSelect
              value={timezone ?? profile?.timezone ?? 'Pacific/Auckland'}
              onChange={(event) => setTimezone(event.target.value)}
            >
              <option value="Pacific/Auckland">New Zealand</option>
              <option value="Australia/Melbourne">Melbourne / Sydney</option>
              <option value="Australia/Brisbane">Brisbane</option>
              <option value="Australia/Perth">Perth</option>
            </NativeSelect>
          </label>
          <Button disabled={saving || !profile} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save preferences'}
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>2. Add ANZ and CommBank history</CardTitle>
            <CardDescription>Use an export for each account, keeping NZD and AUD separate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6">
            <p>
              Download an OFX bank export where available. For an XLSX file, check the import preview before committing.
              If a format is rejected, keep the original file and its error rather than editing amounts to force an
              import.
            </p>
            <p>
              In Imports, select the matching account, review possible duplicates and commit. Repeated exports retain
              their evidence. In Accounts, add a dated balance if the export does not contain one.
            </p>
            <p>
              Use enough history for the period you want to compare. Spending shows missing coverage and FX instead of
              assuming a partial month is complete.
            </p>
            <Link
              to="/imports"
              search={{ importId: undefined, account: undefined }}
              className="font-medium text-primary underline"
            >
              Open Imports
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>3. Ask ChatGPT to review spending</CardTitle>
            <CardDescription>You can use the file workflow before connecting ChatGPT.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6">
            <p>
              In Updates, download a review pack. Give the pack to ChatGPT outside Koru and use its included
              instructions. Ask it to use your category definitions, keep manual decisions and leave ambiguous items as
              questions.
            </p>
            <p>
              Upload its proposals in Updates. Read the preview, resolve conflicts, then apply the reviewed job. Keep
              the receipt. Undo is available while later edits do not conflict.
            </p>
            <p>
              For future merchant rules, say “from now on.” For old transactions, ask for the specific records you want
              changed. A one-off correction does not change future defaults.
            </p>
            <Link to="/updates" className="font-medium text-primary underline">
              Open Updates
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>4. Record everything you own and owe</CardTitle>
            <CardDescription>Dated statements are the starting point for Exposure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6">
            <p>
              Get a dated statement for your Smart holdings, Simplicity KiwiSaver High Growth and Hostplus Indexed High
              Growth. Record Hostplus in its original AUD. Your screenshot is an undated inventory; do not use its
              converted total as a current balance.
            </p>
            <p>
              Use a distinct account and fund identifier for each position. Record statement units, value, date, source
              and whether same-day activity is already included. KiwiSaver and super are retirement restrictions; their
              underlying assets still need a breakdown.
            </p>
            <p>
              For a fund switch, keep the old fund's identity. Ask ChatGPT to prepare one reviewed job with a dated zero
              position for the old fund and a separate position for the new fund, using the official switch statement.
              Review both changes together before applying.
            </p>
            <p>
              Bank cash comes from Accounts. Avoid entering it again as a manual asset. Add property, other assets or
              debts only if you have them, using your ownership share and a dated valuation.
            </p>
            <Link to="/exposure" className="font-medium text-primary underline">
              Open Exposure
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>5. Add breakdowns and exchange rates</CardTitle>
            <CardDescription>
              A fund's listing country does not describe all its underlying investments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6">
            <p>
              Supply official dated country, industry and asset-class breakdowns for your funds. ChatGPT can help
              prepare them from copies of provider disclosures. Keep source evidence and mark targets or incomplete
              extracts as estimates.
            </p>
            <p>
              In Spending, refresh published NZD/AUD rates for your selected month and its comparison periods. You can
              also add sourced daily rates in Exposure. A missing date can use the preceding published rate up to seven
              calendar days old. Missing conversions leave the combined total incomplete.
            </p>
            <p>
              Check unresolved value and source dates before relying on an allocation. Separate country and industry
              percentages cannot answer a combined country-and-industry question without underlying joint data.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>6. Use monthly purchase emails</CardTitle>
            <CardDescription>Copy the email; no broker login or mailbox access is required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6">
            <p>
              Save the email as text, PDF or a screenshot. Ask ChatGPT to extract only the fields present, including
              account, fund, date, units, currency and any trade reference. Retain the original evidence.
            </p>
            <p>
              Review the purchase against the position's statement cutoff in Exposure. Two sources can describe one
              purchase; two identical buys can also be legitimate. Resolve ambiguous matches explicitly.
            </p>
            <p>
              Reconcile with a newer dated statement periodically. Purchase emails alone may omit sales, fees, switches
              or reinvestments. A purchase amount is not today's value.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your monthly check</CardTitle>
            <CardDescription>One review of new activity and exceptions.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6">
              <li>Refresh ANZ or import files for both bank accounts.</li>
              <li>Use confirmed categories, then ask ChatGPT about exceptions in Updates.</li>
              <li>Add the purchase email and reconcile any ambiguous evidence.</li>
              <li>Update statement balances and stale prices or breakdowns.</li>
              <li>Check coverage, FX dates and unresolved values in Spending and Exposure.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Connect read-only services</CardTitle>
          <CardDescription>File updates continue to work while these connections are being set up.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm leading-6">
          <div>
            <h3 className="font-medium">ANZ through Akahu</h3>
            <p>
              Server credentials{' '}
              {readiness === undefined
                ? 'are being checked'
                : readiness.akahuConfigured
                  ? 'are configured'
                  : 'have not been configured'}
              . This is configuration status, not proof of a successful bank connection.
            </p>
            <p>
              Confirm that Akahu's personal app supports the official ANZ bank-side consent flow. Select account
              information only, authorize in goMoney, then configure the server credentials. If official personal
              connectivity is unavailable, continue with exports. Do not paste bank or Akahu tokens into ChatGPT.
            </p>
            <a
              className="text-primary underline"
              href="https://developers.akahu.nz/docs/personal-apps"
              target="_blank"
              rel="noreferrer"
            >
              Akahu personal-app instructions
            </a>
          </div>
          <div>
            <h3 className="font-medium">ChatGPT through Koru MCP</h3>
            <p>
              Server authentication{' '}
              {readiness === undefined
                ? 'is being checked'
                : readiness.mcpConfigured
                  ? 'is configured'
                  : 'has not been configured'}
              . Enable a personal developer-mode connection only when supported by your ChatGPT account.
            </p>
            <p>
              Configure WorkOS Connect for the Koru MCP resource, then enable access in Updates to bind your existing
              Koru profile. Add the endpoint in ChatGPT and start with reads and proposals. Review and authorize the
              exact changes in Koru before connected apply or undo. Your bank credentials are never part of this
              connection.
            </p>
            <a
              className="text-primary underline"
              href="https://developers.openai.com/plugins/deploy/connect-chatgpt"
              target="_blank"
              rel="noreferrer"
            >
              ChatGPT connection instructions
            </a>
            <p>
              The repository includes a personal Koru plugin and finance-updates skill. It can guide file reviews before
              OAuth is ready. Once configured, install it from the Koru personal local source in a supported ChatGPT
              desktop client, or add the MCP connection directly in web ChatGPT.
            </p>
          </div>
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">Developer setup and verification</summary>
            <div className="mt-3 space-y-2">
              <p>
                Set secrets in the Convex deployment, not browser variables. Akahu needs AKAHU_APP_TOKEN,
                AKAHU_USER_TOKEN and AKAHU_OWNER_TOKEN_IDENTIFIER from your existing profile. Configure
                MCP_AUTHORIZATION_SERVER_URL as the AuthKit HTTPS origin without a trailing slash and MCP_RESOURCE_URL
                as the exact HTTPS Convex site endpoint ending in /mcp. Use the existing WorkOS users, that resource
                audience and the koru.read, koru.propose and optional koru.apply scopes.
              </p>
              <p>
                README.md has the exact configuration and plugin command. Enable connections in Updates after server
                setup. Disconnect Akahu in Koru to stop its jobs, and revoke the bank consent or token separately in
                Akahu or ANZ. Deploy backend changes to the intended development environment first.
              </p>
              <p>
                Run the repository test, lint and build checks. Provider fixture tests do not prove a live ANZ
                connection, and MCP transport tests do not prove authorization in your ChatGPT account. Keep CommBank
                exports until a separate Australian provider is selected.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
