import { useMutation } from 'convex/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { api } from '../../../convex/_generated/api';
import { showError } from './finance-ui';

export function PortfolioForms() {
  const savePosition = useMutation(api.portfolio.savePosition);
  const saveRate = useMutation(api.portfolio.saveRate);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="space-y-3 rounded-lg border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          void savePosition({
            key: String(data.get('key')),
            name: String(data.get('name')),
            account: String(data.get('account')),
            instrument: String(data.get('instrument')),
            currency: String(data.get('currency')),
            retirement: data.get('retirement') === 'on',
            debt: data.get('debt') === 'on',
            ownershipShare: String(data.get('ownershipShare')),
            snapshotDate: String(data.get('date')),
            basis: data.get('basis') === 'settlement' ? 'settlement' : 'trade',
            sameDayCovered: data.get('sameDayCovered') === 'included',
            units: String(data.get('units')),
            value: String(data.get('value')),
            source: String(data.get('source')),
            evidence: String(data.get('evidence')),
          })
            .then(() => toast.success('Dated position saved.'))
            .catch(showError);
        }}
      >
        <h3 className="font-heading font-semibold">Record a statement or other asset</h3>
        <p className="text-sm text-muted-foreground">
          Use a dated statement. For property or another asset without units, enter 0 units and its current value. Enter
          the total asset value before ownership, then your ownership share. Koru applies that share once.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: 'name', label: 'Asset name', placeholder: 'Simplicity KiwiSaver' },
            { name: 'key', label: 'Position identity', placeholder: 'simplicity-kiwisaver' },
            { name: 'account', label: 'Account or asset location', placeholder: 'Simplicity' },
            { name: 'instrument', label: 'Investment identity', placeholder: 'FundNZ:25641' },
            { name: 'date', label: 'Statement date', type: 'date' },
            { name: 'units', label: 'Units held', placeholder: '51720.1104' },
            { name: 'value', label: 'Total asset value before ownership share', placeholder: '85746.77' },
            { name: 'ownershipShare', label: 'Your ownership share, 1 means all', placeholder: '1' },
            { name: 'source', label: 'Statement or valuation source', placeholder: 'September statement' },
          ].map((field) => (
            <label className="space-y-1 text-sm" key={field.name}>
              <span>{field.label}</span>
              <Input required name={field.name} type={field.type ?? 'text'} placeholder={field.placeholder} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label>
            Currency{' '}
            <select name="currency" className="rounded border p-2">
              <option>NZD</option>
              <option>AUD</option>
            </select>
          </label>
          <label>
            Coverage basis{' '}
            <select name="basis" required defaultValue="" className="rounded border p-2">
              <option value="">Choose the stated date basis</option>
              <option value="trade">Trade date</option>
              <option value="settlement">Settlement date</option>
            </select>
          </label>
          <label>
            <input name="retirement" type="checkbox" /> Retirement savings
          </label>
          <label>
            <input name="debt" type="checkbox" /> Debt, enter positive balance
          </label>
          <label>
            Same-day statement coverage
            <select name="sameDayCovered" required defaultValue="" className="ml-2 rounded border p-2">
              <option value="">Unknown, verify before saving</option>
              <option value="included">Includes all activity on this date</option>
              <option value="excluded">Excludes activity on this date</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Copied statement or valuation evidence</span>
          <Textarea required name="evidence" />
        </label>
        <p className="text-xs text-muted-foreground">
          Bank accounts appear from their dated balance records automatically. Reuse the position identity for later
          statements. Country, industry and asset class need official sourced breakdowns.
        </p>
        <Button type="submit">Save reviewed position</Button>
      </form>
      <form
        className="space-y-3 rounded-lg border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void saveRate({
            from: String(data.get('from')),
            to: String(data.get('to')),
            date: String(data.get('date')),
            rate: String(data.get('rate')),
            source: String(data.get('source')),
          })
            .then(() => toast.success('Dated FX rate saved.'))
            .catch(showError);
        }}
      >
        <h3 className="font-heading font-semibold">Add a currency conversion</h3>
        <p className="text-sm text-muted-foreground">
          Record how much reporting currency one unit of the source currency buys. Reports use the latest rate on or
          before their date, up to seven days earlier.
        </p>
        <div className="flex gap-3">
          {['from', 'to'].map((name) => (
            <label key={name} className="text-sm">
              {name === 'from' ? 'From' : 'To'}
              <select name={name} defaultValue={name === 'from' ? 'AUD' : 'NZD'} className="ml-2 rounded border p-2">
                <option>NZD</option>
                <option>AUD</option>
              </select>
            </label>
          ))}
        </div>
        <label className="block text-sm">
          Rate date
          <Input required name="date" type="date" />
        </label>
        <label className="block text-sm">
          Conversion rate
          <Input required name="rate" placeholder="1.1" />
        </label>
        <label className="block text-sm">
          Published source
          <Input required name="source" placeholder="Daily FX source and URL" />
        </label>
        <Button type="submit">Save reviewed FX rate</Button>
      </form>
    </div>
  );
}
