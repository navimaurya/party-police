"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Eye, FileText, Globe, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmButton } from "@/components/admin/confirm";
import { NativeSelect } from "@/components/admin/native-select";
import { api, toastError } from "@/lib/api-client";
import { formatBytes, formatDateTime, formatMoney } from "@/lib/format";
import { EMPTY_STATES } from "@/lib/humor";
import { SortSelect } from "@/components/shared/sort-header";
import { BILL_DEFAULT_SORT } from "@/lib/sort-fields";

export type BillRow = {
  _id: string;
  kind: "bill" | "attachment";
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  amount?: number | null;
  description: string;
  isPublic: boolean;
  uploadedAt: string;
  eventId?: string | { _id: string; title: string } | null;
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

export function BillsManager({
  eventId,
  bills,
  maxSizeMb,
  showEvent = false,
  sort,
}: {
  eventId?: string;
  bills: BillRow[];
  maxSizeMb: number;
  showEvent?: boolean;
  /** When set, shows a "Sort by" control (the all-bills page). */
  sort?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [kind, setKind] = useState<"bill" | "attachment">("bill");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function upload(files: FileList | File[]) {
    if (!eventId) return;
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    let okCount = 0;
    for (const file of list) {
      if (file.size > maxSizeMb * 1024 * 1024) {
        toast.error(`${file.name} is larger than ${maxSizeMb} MB`);
        continue;
      }
      const form = new FormData();
      form.set("file", file);
      form.set("eventId", eventId);
      form.set("kind", kind);
      form.set("isPublic", String(isPublic));
      if (amount) form.set("amount", amount);
      if (description) form.set("description", description);
      try {
        await api("/api/bills", { method: "POST", body: form });
        okCount++;
      } catch (err) {
        toastError(err, `Upload failed for ${file.name}`);
      }
    }
    setUploading(false);
    if (okCount) {
      toast.success(`${okCount} file${okCount === 1 ? "" : "s"} uploaded 🧾`);
      setAmount("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    }
  }

  async function togglePublic(b: BillRow) {
    try {
      await api(`/api/bills/${b._id}`, { method: "PATCH", json: { isPublic: !b.isPublic } });
      toast.success(!b.isPublic ? "Now public 🌍" : "Now private 🔒");
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }

  async function copySignedLink(b: BillRow) {
    try {
      const { url, expiresAt } = await api<{ url: string; expiresAt: string }>("/api/files/sign", {
        method: "POST",
        json: { fileId: b._id, op: "view", ttlSeconds: 60 * 60 },
      });
      await navigator.clipboard.writeText(url);
      toast.success(`Signed link copied. Expires ${formatDateTime(expiresAt)} ⏳`);
    } catch (err) {
      toastError(err, "Couldn't create link");
    }
  }

  async function remove(b: BillRow) {
    try {
      await api(`/api/bills/${b._id}`, { method: "DELETE" });
      toast.success("File deleted from disk 🗑️");
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="space-y-4">
      {eventId && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void upload(e.dataTransfer.files);
          }}
          className={`space-y-3 rounded-2xl border-2 border-dashed p-4 transition ${dragOver ? "border-primary bg-pink-50" : "border-border"}`}
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="bill-kind">Type</Label>
              <NativeSelect id="bill-kind" value={kind} onChange={(e) => setKind(e.target.value as "bill" | "attachment")}>
                <option value="bill">🧾 Bill / receipt</option>
                <option value="attachment">📸 Photo / attachment</option>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bill-amount">Amount (₹, optional)</Label>
              <Input id="bill-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="bill-desc">Description (optional)</Label>
              <Input id="bill-desc" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isPublic} onCheckedChange={setIsPublic} /> {isPublic ? "🌍 Public (visible on website)" : "🔒 Private (admin / signed link only)"}
            </label>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
              <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Upload files
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WEBP · max {maxSizeMb} MB · or drag & drop here</p>
        </div>
      )}

      {sort && bills.length > 0 && (
        <div className="flex justify-end">
          <SortSelect
            current={sort}
            defaultSort={BILL_DEFAULT_SORT}
            options={[
              { value: "-uploadedAt", label: "Newest uploads" },
              { value: "uploadedAt", label: "Oldest uploads" },
              { value: "originalFileName", label: "File name (A–Z)" },
              { value: "-fileSize", label: "Largest files" },
              { value: "-amount", label: "Amount (highest first)" },
            ]}
          />
        </div>
      )}
      {bills.length === 0 ? (
        <EmptyState emoji="🧾" message={EMPTY_STATES.bills} />
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {bills.map((b) => {
            const ev = typeof b.eventId === "object" && b.eventId ? b.eventId : null;
            return (
              <li key={b._id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {b.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated file route
                    <img src={`/api/files/${b._id}`} alt="" className="size-12 shrink-0 rounded-lg border object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted"><FileText className="size-5 text-muted-foreground" /></span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.originalFileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.kind === "bill" ? "🧾 Bill" : "📸 Attachment"} · {formatBytes(b.fileSize)} · {formatDateTime(b.uploadedAt)}
                      {b.amount != null && ` · ${formatMoney(b.amount)}`}
                    </p>
                    {showEvent && ev && <p className="truncate text-xs">🎉 <a className="hover:underline" href={`/admin/parties/${ev._id}`}>{ev.title}</a></p>}
                    {b.description && <p className="truncate text-xs text-muted-foreground">{b.description}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => togglePublic(b)} aria-label={b.isPublic ? "Make private" : "Make public"}>
                    {b.isPublic ? <><Globe /> Public</> : <><Lock /> Private</>}
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Preview" onClick={() => window.open(`/api/files/${b._id}`, "_blank", "noopener")}><Eye /></Button>
                  <a href={`/api/files/${b._id}?op=download`} download aria-label="Download" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}><Download /></a>
                  <Button variant="ghost" size="icon-sm" aria-label="Copy 1-hour signed link" title="Copy 1-hour signed link" onClick={() => copySignedLink(b)}><Copy /></Button>
                  <ConfirmButton
                    trigger={<Button variant="ghost" size="icon-sm" className="text-destructive" aria-label="Delete file"><Trash2 /></Button>}
                    title="Delete this file?"
                    description="The file is permanently removed from storage."
                    onConfirm={() => remove(b)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
