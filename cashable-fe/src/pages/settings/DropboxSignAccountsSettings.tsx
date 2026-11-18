import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createDropboxSignAccountProfile,
  deleteDropboxSignAccountProfile,
  fetchDropboxSignAccountProfiles,
  updateDropboxSignAccountProfile,
  type DropboxSignAccountProfile,
  type DropboxSignAccountProfileInput,
} from "@/redux/actions/integrationSettingsActions";
import DropboxSignAccountModal from "./DropboxSignAccountModal";

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

export default function DropboxSignAccountsSettings() {
  const [rows, setRows] = useState<DropboxSignAccountProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DropboxSignAccountProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchDropboxSignAccountProfiles());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load Dropbox Sign accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (payload: DropboxSignAccountProfileInput) => {
    setSaving(true);
    try {
      if (editing) {
        await updateDropboxSignAccountProfile(editing.id, payload);
        toast.success("Dropbox Sign account updated");
      } else {
        await createDropboxSignAccountProfile(payload);
        toast.success("Dropbox Sign account added");
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save Dropbox Sign account");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: DropboxSignAccountProfile) => {
    if (!window.confirm(`Delete Dropbox Sign account "${row.name}"?`)) return;
    try {
      await deleteDropboxSignAccountProfile(row.id);
      toast.success("Dropbox Sign account deleted");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Add a Dropbox Sign API key for each signing account, then link funders to these
          accounts on the Funders tab so contracts route to the right account. Funders without
          a linked account use the platform default key from the server environment.
        </p>
        <Button
          className="gap-2 bg-[image:var(--brand-gradient)] hover:opacity-90 shrink-0"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add Dropbox Sign account
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Dropbox Sign accounts…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No Dropbox Sign accounts yet. Contracts are sent with the platform default API key
            until funder-specific accounts are added here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.id} className={!row.isActive ? "opacity-70" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{row.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditing(row);
                        setModalOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => void handleDelete(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.isActive ? "Active" : "Inactive"}
                  {row.funderCount != null ? ` · ${row.funderCount} funder(s)` : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <DetailRow label="API key" value={row.hasApiKey ? row.apiKey : "Missing"} />
                <DetailRow label="Client ID (embedded)" value={row.clientId} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DropboxSignAccountModal
        open={modalOpen}
        saving={saving}
        initial={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}
