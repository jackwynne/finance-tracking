import { IconFileUpload, IconLoader2 } from '@tabler/icons-react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { showError } from './finance-ui';

export function UpdateSources() {
  const registerText = useMutation(api.updates.registerTextSource);
  const uploadSource = useAction(api.updates.uploadSource);
  const sources = useQuery(api.updates.listSources, {});
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<'updateEvidence'> | null>(null);
  const evidence = useQuery(api.updates.getSourceEvidence, selectedId ? { sourceId: selectedId } : 'skip');
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveText() {
    setBusy(true);
    try {
      const id = await registerText({ title, text });
      setSelectedId(id);
      setText('');
      toast.success('Source text saved. Download a fresh review bundle to include its reference.');
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      if (file.size > 500_000) throw new Error('Choose a source file up to 500 KB, or paste the relevant email text.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 24_000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 24_000));
      const id = await uploadSource({
        title: title.trim() || file.name,
        base64: btoa(binary),
        contentType: file.type || 'application/octet-stream',
      });
      setSelectedId(id);
      toast.success('Original source saved. Download a fresh review bundle to include its reference.');
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle>Save purchase emails and other evidence</CardTitle>
        <CardDescription>
          Keep an original copy in Koru before asking ChatGPT to prepare updates. Source references belong to your
          signed-in profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span>Source title</span>
            <Input
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="September share purchase email"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Copied email or statement text</span>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-32"
              placeholder="Paste the dates, instruments, units and trade references from the email."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !title.trim() || !text.trim()} onClick={() => void saveText()}>
              {busy && <IconLoader2 className="animate-spin" />} Save source text
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              <IconFileUpload /> Save original file
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            aria-label="Save original source file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Text up to 100 KB or a file up to 500 KB. Saving evidence does not add a purchase. Give ChatGPT the original
            file separately, then ask it to include the saved evidence reference in its proposals.
          </p>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Recent saved evidence</h3>
          {sources === undefined ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading evidence...
            </p>
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No evidence saved yet.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-auto">
              {sources.map((source) => (
                <button
                  key={source._id}
                  type="button"
                  onClick={() => setSelectedId(source._id)}
                  className={`block w-full rounded-lg border p-3 text-left text-sm hover:bg-muted/40 ${source._id === selectedId ? 'border-primary' : ''}`}
                >
                  <span className="block font-medium">{source.title}</span>
                  <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                    evidence:{source._id}
                  </span>
                </button>
              ))}
            </div>
          )}
          {selectedId && evidence === undefined ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading source...
            </p>
          ) : (
            evidence && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">{evidence.title}</p>
                <p className="break-all font-mono text-xs">evidence:{selectedId}</p>
                {evidence.url && (
                  <a
                    href={evidence.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sm text-primary underline"
                  >
                    Download original file
                  </a>
                )}
                {evidence.text && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{evidence.text}</pre>
                )}
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
