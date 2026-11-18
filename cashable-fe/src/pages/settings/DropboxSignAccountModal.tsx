import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  DropboxSignAccountProfile,
  DropboxSignAccountProfileInput,
} from "@/redux/actions/integrationSettingsActions";

type Props = {
  open: boolean;
  saving?: boolean;
  initial?: DropboxSignAccountProfile | null;
  onClose: () => void;
  onSave: (payload: DropboxSignAccountProfileInput) => Promise<void>;
};

const emptyForm: DropboxSignAccountProfileInput = {
  name: "",
  apiKey: "",
  clientId: "",
  isActive: true,
};

export default function DropboxSignAccountModal({ open, saving, initial, onClose, onSave }: Props) {
  const [form, setForm] = useState<DropboxSignAccountProfileInput>(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      // The stored API key is masked server-side; leaving it blank keeps the saved key.
      setForm({
        name: initial.name,
        apiKey: "",
        clientId: initial.clientId || "",
        isActive: initial.isActive,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, initial]);

  const set = <K extends keyof DropboxSignAccountProfileInput>(
    key: K,
    value: DropboxSignAccountProfileInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const canSave =
    String(form.name || "").trim() && (initial ? true : String(form.apiKey || "").trim());

  const handleSave = async () => {
    await onSave({
      name: String(form.name || "").trim(),
      ...(String(form.apiKey || "").trim() ? { apiKey: String(form.apiKey).trim() } : {}),
      clientId: String(form.clientId || "").trim() || null,
      isActive: form.isActive !== false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit Dropbox Sign account" : "Add Dropbox Sign account"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Account name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Cashable Fund LLC"
            />
          </div>
          <div className="grid gap-2">
            <Label>API key</Label>
            <Input
              type="password"
              value={form.apiKey || ""}
              onChange={(e) => set("apiKey", e.target.value)}
              placeholder={initial?.hasApiKey ? "Leave blank to keep the saved key" : "From Dropbox Sign → Settings → API"}
            />
          </div>
          <div className="grid gap-2">
            <Label>Client ID (optional)</Label>
            <Input
              value={form.clientId || ""}
              onChange={(e) => set("clientId", e.target.value)}
              placeholder="API App client ID — needed for embedded signing"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            Active
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-[image:var(--brand-gradient)] hover:opacity-90"
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
