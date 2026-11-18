"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, UserPlus, X } from "lucide-react";
import { UserAvatar } from "@/components/admin/user-badges";
import { cn } from "@/lib/utils";

export type Participant = { name: string; email?: string | null };
export type PickerUser = { name: string; email: string; role?: string };

const EMAIL_RX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** "Priya <priya@x.com>", "priya@x.com" or "Priya" -> a guest participant. */
function parseGuest(text: string): Participant | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(.*?)\s*<([^<>\s]+)>$/.exec(t);
  if (m && EMAIL_RX.test(m[2])) return { name: m[1].trim() || m[2].split("@")[0], email: m[2].toLowerCase() };
  if (EMAIL_RX.test(t)) return { name: t.split("@")[0], email: t.toLowerCase() };
  return { name: t.slice(0, 100) };
}

const keyOf = (p: Participant) => (p.email ? `e:${p.email.toLowerCase()}` : `n:${p.name.toLowerCase()}`);

/**
 * Multi-select for party participants: pick users from the list (search, keyboard,
 * select all), or add a guest who isn't a user.
 */
export function ParticipantPicker({
  users,
  value,
  onChange,
  id,
}: {
  users: PickerUser[];
  value: Participant[];
  onChange: (next: Participant[]) => void;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? `pp-${autoId}`;
  const listId = `${inputId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selectedKeys = useMemo(() => new Set(value.map(keyOf)), [value]);
  const userByEmail = useMemo(() => new Map(users.map((u) => [u.email.toLowerCase(), u])), [users]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : users),
    [users, q]
  );
  const guest = useMemo(() => {
    const g = parseGuest(query);
    if (!g) return null;
    // Typing an existing user's email selects the user, not a guest.
    if (g.email && userByEmail.has(g.email)) return null;
    return selectedKeys.has(keyOf(g)) ? null : g;
  }, [query, userByEmail, selectedKeys]);
  const options: ({ kind: "user"; user: PickerUser } | { kind: "guest"; guest: Participant })[] = [
    ...filtered.map((user) => ({ kind: "user" as const, user })),
    ...(guest && filtered.length === 0 ? [{ kind: "guest" as const, guest }] : []),
  ];
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggleUser = (u: PickerUser) => {
    const k = `e:${u.email.toLowerCase()}`;
    onChange(selectedKeys.has(k) ? value.filter((p) => keyOf(p) !== k) : [...value, { name: u.name, email: u.email }]);
  };
  const addGuest = (g: Participant) => {
    onChange([...value, g]);
    setQuery("");
  };
  const remove = (p: Participant) => onChange(value.filter((x) => keyOf(x) !== keyOf(p)));
  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.kind === "user") toggleUser(o.user);
    else addGuest(o.guest);
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((u) => selectedKeys.has(`e:${u.email.toLowerCase()}`));
  const selectAll = () => {
    const add = filtered.filter((u) => !selectedKeys.has(`e:${u.email.toLowerCase()}`)).map((u) => ({ name: u.name, email: u.email }));
    onChange([...value, ...add]);
  };
  const clearFiltered = () => {
    const drop = new Set(filtered.map((u) => `e:${u.email.toLowerCase()}`));
    onChange(value.filter((p) => !drop.has(keyOf(p))));
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // Never submit the party form from here.
      e.preventDefault();
      if (open && options.length) choose(activeIndex);
      else if (guest) addGuest(guest);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    }
  }

  const userCount = value.filter((p) => p.email && userByEmail.has(p.email.toLowerCase())).length;
  const guestCount = value.length - userCount;

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5 text-sm transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          open && "border-ring"
        )}
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {value.map((p) => {
          const isUser = !!(p.email && userByEmail.has(p.email.toLowerCase()));
          return (
            <span key={keyOf(p)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/60 py-0.5 pr-1 pl-0.5 text-xs">
              <UserAvatar name={p.name} email={p.email ?? p.name} size="sm" className="size-5 text-[9px]" />
              <span className="truncate font-medium">{p.name}</span>
              {!isUser && <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">Guest</span>}
              <button
                type="button"
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Remove ${p.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(p);
                }}
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options.length ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          className="min-w-32 flex-1 bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground"
          placeholder={value.length ? "Add more…" : "Search users or type a guest's name/email…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} aria-hidden />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
              <span>{filtered.length} user{filtered.length === 1 ? "" : "s"}{q ? " found" : ""}</span>
              <button type="button" className="font-medium text-primary hover:underline" onClick={allFilteredSelected ? clearFiltered : selectAll}>
                {allFilteredSelected ? "Clear" : q ? "Select these" : "Select all"}
              </button>
            </div>
          )}
          <ul id={listId} role="listbox" aria-multiselectable className="max-h-64 overflow-y-auto p-1">
            {options.map((o, i) => {
              if (o.kind === "guest") {
                return (
                  <li
                    key="guest"
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={false}
                    className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm", i === activeIndex && "bg-accent")}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(i)}
                  >
                    <UserPlus className="size-4 text-muted-foreground" />
                    <span>
                      Add guest <strong>{o.guest.name}</strong>
                      {o.guest.email && <span className="text-muted-foreground"> · {o.guest.email}</span>}
                    </span>
                  </li>
                );
              }
              const u = o.user;
              const selected = selectedKeys.has(`e:${u.email.toLowerCase()}`);
              return (
                <li
                  key={u.email}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", i === activeIndex && "bg-accent")}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                >
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", selected ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                    {selected && <Check className="size-3" />}
                  </span>
                  <UserAvatar name={u.name} email={u.email} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  {u.role && u.role !== "Member" && <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{u.role}</span>}
                </li>
              );
            })}
            {options.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {users.length === 0 ? "No users yet. Add them in Users, or type a guest's name." : "No matches. Keep typing a name or email to add a guest."}
              </li>
            )}
          </ul>
        </div>
      )}

      <p className="mt-1.5 text-xs text-muted-foreground">
        {value.length === 0
          ? "Pick from your users, or type a name/email and press Enter to add a guest."
          : `${userCount} user${userCount === 1 ? "" : "s"}${guestCount ? ` + ${guestCount} guest${guestCount === 1 ? "" : "s"}` : ""} selected. Emails are never shown publicly.`}
      </p>
    </div>
  );
}
