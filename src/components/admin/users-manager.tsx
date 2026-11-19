"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCog,
  KeyRound,
  Loader2,
  Send,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRoundCog,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/admin/native-select";
import { SortHeader } from "@/components/shared/sort-header";
import { USER_DEFAULT_SORT } from "@/lib/sort-fields";
import { RoleBadge, StatusBadge, UserAvatar } from "@/components/admin/user-badges";
import { api, toastError } from "@/lib/api-client";
import { formatDateTime, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OccasionsEditor, occasionsToPayload, toOccasionRows, type OccasionRow } from "@/components/admin/occasions-editor";
import { ROLE_LABELS, ROLE_RANK, type AssignableRole, type UserRole } from "@/types";

export type UserRow = {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  department?: string;
  designation?: string;
  birthday?: string | null;
  joinedOn?: string | null;
  notes?: string;
  occasions?: { personName: string; relation: string; occasion: string; label?: string; date: string }[];
  isActive: boolean;
  /** Has a password (can sign in). */
  canSignIn?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
};

type Viewer = { id: string; role: UserRole };

const ROLE_HINTS: Record<AssignableRole, string> = {
  member: "Signs in, adds the parties they give and asks for approval.",
  manager: "Schedules and modifies everyone's parties.",
  admin: "Full access to Party HQ, including users and approvals.",
};
type Filters = { q?: string; role?: string; status?: string };

/* Mirrors the server rules in user.service.ts (the server enforces them). */
const isSuper = (v: Viewer) => v.role === "super_admin";
const canEdit = (u: UserRow, v: Viewer) => (u.role === "super_admin" ? u._id === v.id : u.role === "admin" ? isSuper(v) : true);
const canDelete = (u: UserRow) => u.role === "member" || u.role === "manager";
/** Roles the viewer may move this user to (mirrors user.service.ts). */
const roleTargets = (u: UserRow, v: Viewer): AssignableRole[] => {
  if (u.role === "super_admin" || u._id === v.id) return [];
  if (u.role === "admin" && !isSuper(v)) return [];
  return (["member", "manager", "admin"] as const).filter((r) => r !== u.role && (r !== "admin" || isSuper(v)));
};

const emptyForm = () => ({
  email: "",
  name: "",
  role: "member" as AssignableRole,
  password: "",
  phone: "",
  department: "",
  designation: "",
  birthday: "",
  joinedOn: "",
  notes: "",
  occasions: [] as OccasionRow[],
  isActive: true,
});
type Form = ReturnType<typeof emptyForm>;

export function UsersManager({
  items,
  total,
  page,
  limit,
  viewer,
  filters,
  sort = USER_DEFAULT_SORT,
}: {
  items: UserRow[];
  total: number;
  page: number;
  limit: number;
  viewer: Viewer;
  filters: Filters;
  sort?: string;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const [pwTarget, setPwTarget] = useState<{ user: UserRow } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; label: string; destructive?: boolean; run: () => Promise<void> } | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** Step 1 -> 2 only when the basic details are valid (browser validation shows what's missing). */
  function goNext() {
    if (formRef.current && !formRef.current.reportValidity()) return;
    setStep(2);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setStep(1);
    setFormOpen(true);
  }

  function openEdit(u: UserRow) {
    if (u._id === viewer.id) {
      router.push("/admin/profile");
      return;
    }
    setEditing(u);
    setStep(1);
    setForm({
      email: u.email,
      name: u.name,
      role: u.role === "super_admin" ? "admin" : u.role,
      password: "",
      phone: u.phone ?? "",
      department: u.department ?? "",
      designation: u.designation ?? "",
      birthday: toDateInput(u.birthday),
      joinedOn: toDateInput(u.joinedOn),
      notes: u.notes ?? "",
      occasions: toOccasionRows(u.occasions),
      isActive: u.isActive,
    });
    setFormOpen(true);
  }

  async function patch(u: UserRow, body: Record<string, unknown>, success: string) {
    try {
      await api(`/api/users/${u._id}`, { method: "PATCH", json: body });
      toast.success(success);
      router.refresh();
    } catch (err) {
      toastError(err);
      throw err;
    }
  }

  async function save() {
    setBusy(true);
    const { email, password, role, birthday, joinedOn, occasions, isActive, ...profile } = form;
    const dates = {
      birthday: birthday ? new Date(`${birthday}T00:00:00`).toISOString() : null,
      joinedOn: joinedOn ? new Date(`${joinedOn}T00:00:00`).toISOString() : null,
      occasions: occasionsToPayload(occasions),
    };
    try {
      if (editing) {
        // Role and password are changed from the row menu, not this form.
        await api(`/api/users/${editing._id}`, { method: "PATCH", json: { ...profile, ...dates } });
        toast.success("User updated");
      } else {
        await api("/api/users", {
          method: "POST",
          json: { email, role, isActive, ...profile, ...dates, ...(password ? { password } : {}) },
        });
        toast.success(
          isActive
            ? password
              ? `${form.name} was added. A welcome email is on its way 💌 Share the one-time password with them.`
              : `${form.name} was added. Welcome email and login details are on their way 💌`
            : `${form.name} was added`
        );
      }
      setFormOpen(false);
      router.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function resendWelcome(u: UserRow) {
    try {
      await api(`/api/users/${u._id}/welcome`, { method: "POST" });
      toast.success(`Welcome email queued for ${u.name}. It goes out within a few seconds 💌`);
    } catch (err) {
      toastError(err);
    }
  }

  function askDelete(u: UserRow) {
    setConfirm({
      title: `Delete ${u.name}?`,
      description: "This permanently removes the user. Past parties keep their history. To keep the record, deactivate them instead.",
      label: "Delete user",
      destructive: true,
      run: async () => {
        await api(`/api/users/${u._id}`, { method: "DELETE" });
        toast.success(`${u.name} was deleted`);
        router.refresh();
      },
    });
  }

  function askToggleActive(u: UserRow) {
    setConfirm({
      title: u.isActive ? `Deactivate ${u.name}?` : `Activate ${u.name}?`,
      description: u.isActive
        ? `They will stop receiving party emails${u.role === "admin" ? " and will be signed out of the admin panel" : ""}.`
        : `They will receive party emails again${u.role === "admin" ? " and can sign in" : ""}.`,
      label: u.isActive ? "Deactivate" : "Activate",
      destructive: u.isActive,
      run: () => patch(u, { isActive: !u.isActive }, u.isActive ? `${u.name} was deactivated` : `${u.name} was activated`),
    });
  }

  function askRole(u: UserRow, role: AssignableRole) {
    const up = ROLE_RANK[role] > ROLE_RANK[u.role];
    setConfirm({
      title: `${up ? "Promote" : "Change"} ${u.name} to ${ROLE_LABELS[role].toLowerCase()}?`,
      description: up
        ? `${ROLE_HINTS[role]} They get an email about the promotion${u.canSignIn ? "" : ", plus their login details"}.`
        : `${ROLE_HINTS[role]} They're signed out and lose their current access. No email is sent.`,
      label: `Make ${ROLE_LABELS[role].toLowerCase()}`,
      destructive: !up,
      run: () => patch(u, { role }, `${u.name} is now ${role === "admin" ? "an admin" : `a ${role}`}`),
    });
  }

  function askSendCredentials(u: UserRow) {
    setConfirm({
      title: `Email login details to ${u.name}?`,
      description: u.canSignIn
        ? "They get their username and a new one-time password. Their current password stops working when the email goes out."
        : "They get their username and a one-time password, and choose their own after the first sign-in.",
      label: "Send login details",
      run: async () => {
        await api("/api/users/credentials", { method: "POST", json: { userId: u._id } });
        toast.success(`Login details for ${u.name} are on their way 🔑`);
      },
    });
  }

  function askSendAllCredentials() {
    setConfirm({
      title: "Email login details to everyone who can't sign in yet?",
      description: "Every active user without a password gets their username and a one-time password. Users who already sign in are not affected.",
      label: "Send to everyone",
      run: async () => {
        const { queued } = await api<{ queued: number }>("/api/users/credentials", { method: "POST", json: { allWithoutPassword: true } });
        toast.success(queued ? `Login details queued for ${queued} user${queued === 1 ? "" : "s"} 🔑` : "Everyone can already sign in 🎉");
      },
    });
  }

  return (
    <div className="space-y-4">
      <Toolbar filters={filters} onAdd={openCreate} onSendAll={isSuper(viewer) ? askSendAllCredentials : undefined} />

      <div className="overflow-hidden rounded-2xl border bg-card">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <UserRoundCog className="size-10 text-muted-foreground" />
            <p className="font-medium">No users found</p>
            <p className="text-sm text-muted-foreground">{filters.q || filters.role || filters.status ? "Try a different search or filter." : "Add your team to start sending party emails."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortHeader field="name" label="User" current={sort} defaultSort={USER_DEFAULT_SORT} className="pl-4" />
                  <SortHeader field="role" label="Role" current={sort} defaultSort={USER_DEFAULT_SORT} />
                  <SortHeader field="department" label="Team" current={sort} defaultSort={USER_DEFAULT_SORT} className="hidden lg:table-cell" />
                  <SortHeader field="isActive" label="Status" current={sort} defaultSort={USER_DEFAULT_SORT} firstDir="desc" className="hidden md:table-cell" />
                  <SortHeader field="lastLoginAt" label="Last sign-in" current={sort} defaultSort={USER_DEFAULT_SORT} firstDir="desc" className="hidden xl:table-cell" />
                  <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((u) => {
                  const editable = canEdit(u, viewer);
                  const targets = roleTargets(u, viewer);
                  return (
                    <TableRow key={u._id} className={cn(!u.isActive && "text-muted-foreground")}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={u.name} email={u.email} className={cn(!u.isActive && "opacity-50")} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-medium text-foreground">
                              {u.name}
                              {u._id === viewer.id && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">You</span>}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                            <div className="mt-1 md:hidden"><StatusBadge active={u.isActive} /></div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><RoleBadge role={u.role} /></TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">
                        <p className="truncate">{u.designation || <span className="text-muted-foreground">—</span>}</p>
                        {u.department && <p className="truncate text-xs text-muted-foreground">{u.department}</p>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell"><StatusBadge active={u.isActive} /></TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : u.canSignIn === false ? "Can't sign in yet" : "Never"}
                        {u.mustChangePassword && <span className="block text-[11px] text-amber-700">One-time password pending</span>}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`} />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem disabled={!editable} onClick={() => openEdit(u)}>
                              <Pencil /> {u._id === viewer.id ? "Edit my profile" : "Edit details"}
                            </DropdownMenuItem>
                            {targets.map((r) => (
                              <DropdownMenuItem key={r} onClick={() => askRole(u, r)}>
                                {r === "admin" ? <ShieldCheck /> : r === "manager" ? <CalendarCog /> : <ShieldOff />}{" "}
                                {ROLE_RANK[r] > ROLE_RANK[u.role] ? `Make ${ROLE_LABELS[r].toLowerCase()}` : `Change to ${ROLE_LABELS[r].toLowerCase()}`}
                              </DropdownMenuItem>
                            ))}
                            {u.role !== "super_admin" && isSuper(viewer) && (
                              <DropdownMenuItem onClick={() => setPwTarget({ user: u })}><KeyRound /> Set one-time password</DropdownMenuItem>
                            )}
                            {u.role !== "super_admin" && u.isActive && isSuper(viewer) && (
                              <DropdownMenuItem onClick={() => askSendCredentials(u)}><Send /> Email login details</DropdownMenuItem>
                            )}
                            {u.isActive && (
                              <DropdownMenuItem onClick={() => resendWelcome(u)}><Mail /> Resend welcome email</DropdownMenuItem>
                            )}
                            {u.role !== "super_admin" && (
                              <DropdownMenuItem disabled={!editable} onClick={() => askToggleActive(u)}>
                                <Power /> {u.isActive ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" disabled={!canDelete(u)} onClick={() => askDelete(u)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                            {!canDelete(u) && (
                              <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">
                                {u.role === "super_admin" ? "The Super Admin can't be deleted." : "Admins can't be deleted. Change their role first."}
                              </p>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={page} limit={limit} total={total} />
      </div>

      {/* Create / edit: step 1 basic details, step 2 events (birthday, joining date, relatives' occasions) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>
              {editing ? `Update ${editing.name}'s details.` : "Every user receives party emails, can be a party giver and gets login details by email."}
            </DialogDescription>
          </DialogHeader>
          <StepIndicator step={step} onStep={(n) => (n === 1 ? setStep(1) : goNext())} />
          <form
            ref={formRef}
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === 1) goNext();
              else void save();
            }}
          >
            {step === 1 && (
              <FormSection title="Basic details">
                <Field id="u-email" label="Email" required className="sm:col-span-2" hint={editing ? "The email is the user's username and can't be changed." : "Their username. Unique for every user; it can't be changed later."}>
                  <Input id="u-email" type="email" required maxLength={200} autoComplete="off" value={form.email} disabled={!!editing} onChange={(e) => set("email", e.target.value)} />
                </Field>
                <Field id="u-name" label="Full name" required className="sm:col-span-2">
                  <Input id="u-name" required maxLength={100} value={form.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field id="u-role" label="Role" hint={editing ? "Change the role from the row menu." : isSuper(viewer) ? ROLE_HINTS[form.role] : `${ROLE_HINTS[form.role]} Only the Super Admin can add admins.`}>
                  <NativeSelect id="u-role" value={form.role} disabled={!!editing} onChange={(e) => set("role", e.target.value as AssignableRole)}>
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    {(isSuper(viewer) || form.role === "admin") && <option value="admin">Admin</option>}
                  </NativeSelect>
                </Field>
                <Field id="u-phone" label="Phone">
                  <Input id="u-phone" type="tel" maxLength={30} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </Field>
                <Field id="u-designation" label="Designation">
                  <Input id="u-designation" maxLength={100} value={form.designation} onChange={(e) => set("designation", e.target.value)} />
                </Field>
                <Field id="u-department" label="Department">
                  <Input id="u-department" maxLength={100} value={form.department} onChange={(e) => set("department", e.target.value)} />
                </Field>
                {!editing && isSuper(viewer) && (
                  <Field id="u-password" label="One-time password (optional)" className="sm:col-span-2" hint="Leave empty to email them their username and a generated one-time password. Either way they choose their own after the first sign-in.">
                    <Input id="u-password" type="password" minLength={10} maxLength={200} autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
                  </Field>
                )}
                <Field id="u-notes" label="Notes" className="sm:col-span-2" hint="Only visible to admins.">
                  <Textarea id="u-notes" rows={2} maxLength={1000} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </Field>
                {!editing && (
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <Switch checked={form.isActive} onCheckedChange={(c) => set("isActive", c)} /> Active
                    <span className="text-xs text-muted-foreground">{form.isActive ? "· gets a welcome email and login details right away" : "· no emails"}</span>
                  </label>
                )}
              </FormSection>
            )}

            {step === 2 && (
              <>
                <FormSection title={`${form.name.split(/\s+/)[0] || "Their"}'s own dates`}>
                  <Field id="u-birthday" label="🎂 Birthday">
                    <Input id="u-birthday" type="date" value={form.birthday} onChange={(e) => set("birthday", e.target.value)} />
                  </Field>
                  <Field id="u-joined" label="💼 Joining date">
                    <Input id="u-joined" type="date" value={form.joinedOn} onChange={(e) => set("joinedOn", e.target.value)} />
                  </Field>
                </FormSection>
                <OccasionsEditor value={form.occasions} onChange={(occasions) => set("occasions", occasions)} />
              </>
            )}

            <DialogFooter>
              {step === 1 ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                  <Button type="submit">Next <ArrowRight /></Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setStep(1)}><ArrowLeft /> Back</Button>
                  <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} {editing ? "Save changes" : "Save user"}</Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PasswordDialog
        target={pwTarget}
        onClose={() => setPwTarget(null)}
        onSubmit={async (password) => {
          if (!pwTarget) return;
          const { user } = pwTarget;
          await patch(user, { password }, `One-time password set. ${user.name} was signed out and must choose a new password after signing in.`);
          setPwTarget(null);
        }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant={confirm?.destructive ? "destructive" : "default"}
              disabled={busy}
              onClick={async () => {
                if (!confirm) return;
                setBusy(true);
                try {
                  await confirm.run();
                  setConfirm(null);
                } catch (err) {
                  toastError(err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="animate-spin" />} {confirm?.label}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StepIndicator({ step, onStep }: { step: 1 | 2; onStep: (n: 1 | 2) => void }) {
  const steps = [
    { n: 1 as const, label: "Basic details" },
    { n: 2 as const, label: "Events" },
  ];
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Form steps">
      {steps.map((st, i) => (
        <li key={st.n} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-6 bg-border" aria-hidden />}
          <button
            type="button"
            onClick={() => onStep(st.n)}
            aria-current={step === st.n ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition",
              step === st.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-background/30 text-[10px]">{st.n}</span> {st.label}
          </button>
        </li>
      ))}
    </ol>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ id, label, required, hint, className, children }: { id: string; label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PasswordDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: { user: UserRow } | null;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = confirmPw.length > 0 && password !== confirmPw;
  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) {
          setPassword("");
          setConfirmPw("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>One-time password for {target?.user.name}</DialogTitle>
          <DialogDescription>
            They&apos;re signed out everywhere. This password works for <strong>one sign-in</strong>, after which they must choose their own before using any other page. Share it with them yourself; it isn&apos;t emailed.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (mismatch) return;
            setBusy(true);
            try {
              await onSubmit(password);
              setPassword("");
              setConfirmPw("");
            } catch {
              /* toast already shown */
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field id="pw-new" label="Password" required hint="At least 10 characters.">
            <Input id="pw-new" type="password" required minLength={10} maxLength={200} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field id="pw-confirm" label="Confirm password" required>
            <Input id="pw-confirm" type="password" required minLength={10} maxLength={200} autoComplete="new-password" aria-invalid={mismatch} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          </Field>
          {mismatch && <p className="text-xs text-destructive">Passwords don&apos;t match.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || mismatch}>{busy && <Loader2 className="animate-spin" />} Set one-time password</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Search + role/status filters, kept in the URL so views are shareable and survive refresh. */
function Toolbar({ filters, onAdd, onSendAll }: { filters: Filters; onAdd: () => void; onSendAll?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (patch: Filters) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  const roleTabs: { value?: string; label: string }[] = [
    { label: "All" },
    { value: "super_admin", label: "Super Admin" },
    { value: "admin", label: "Admins" },
    { value: "manager", label: "Managers" },
    { value: "member", label: "Members" },
  ];
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          role="search"
          className="relative sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() || undefined });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={filters.q ?? ""} placeholder="Search name, email, team…" className="pl-9" aria-label="Search users" />
        </form>
        <div className="inline-flex rounded-lg border bg-card p-0.5" role="tablist" aria-label="Filter by role">
          {roleTabs.map((t) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={(filters.role ?? undefined) === t.value}
              onClick={() => go({ role: t.value })}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                (filters.role ?? undefined) === t.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <NativeSelect aria-label="Filter by status" className="sm:w-36" value={filters.status ?? ""} onChange={(e) => go({ status: e.target.value || undefined })}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </NativeSelect>
      </div>
      <div className="flex flex-wrap gap-2">
        {onSendAll && (
          <Button variant="outline" onClick={onSendAll} title="Email username + one-time password to every active user who can't sign in yet">
            <Send /> Send login details
          </Button>
        )}
        <Button onClick={onAdd}><Plus /> Add user</Button>
      </div>
    </div>
  );
}

function Pagination({ page, limit, total }: { page: number; limit: number; total: number }) {
  const params = useSearchParams();
  const pathname = usePathname();
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const href = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  return (
    <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        Showing <strong className="text-foreground">{from}–{to}</strong> of <strong className="text-foreground">{total}</strong>
      </span>
      {total > limit && (
        <div className="flex gap-2">
          {page > 1 ? <Link className="rounded-md border px-3 py-1 hover:bg-muted" href={href(page - 1)}>Previous</Link> : <span className="rounded-md border px-3 py-1 opacity-40">Previous</span>}
          {to < total ? <Link className="rounded-md border px-3 py-1 hover:bg-muted" href={href(page + 1)}>Next</Link> : <span className="rounded-md border px-3 py-1 opacity-40">Next</span>}
        </div>
      )}
    </div>
  );
}

