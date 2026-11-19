"use client";

import { useRouter } from "next/navigation";
import { BadgeCheck, Hand, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/admin/confirm";
import { api, toastError } from "@/lib/api-client";
import type { EventStatus } from "@/types";

/**
 * A party becomes "completed" only through admin approval. The party giver (or a manager)
 * can ask for that approval once the party day has come.
 */
export function StatusActions({
  id,
  status,
  organizerName,
  canApprove = true,
  canRequestApproval = false,
  approvalRequestedAt = null,
}: {
  id: string;
  status: EventStatus;
  organizerName?: string;
  canApprove?: boolean;
  canRequestApproval?: boolean;
  approvalRequestedAt?: string | null;
}) {
  const router = useRouter();
  const requestApproval = async () => {
    try {
      await api(`/api/events/${id}/request-approval`, { method: "POST" });
      toast.success("Approval requested 🙌 The Super Admin has been emailed.");
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  };
  const go = async (next: EventStatus) => {
    try {
      await api(`/api/events/${id}/status`, { method: "PATCH", json: { status: next } });
      toast.success(
        next === "completed"
          ? "Approved! 🎉 The team's thanks is on its way to the party giver. Everyone gets the thank-you in 5 minutes, so upload the bills now 🧾"
          : next === "upcoming"
            ? "Back to upcoming"
            : "Party cancelled"
      );
      router.refresh();
    } catch (err) {
      toastError(err);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {canRequestApproval && (
        <ConfirmButton
          trigger={<Button><Hand /> {approvalRequestedAt ? "Request approval again" : "Request approval"}</Button>}
          title="Party given? Ask for approval"
          description="The Super Admin gets an email asking to confirm the party was given. Once they approve, it's marked completed and the giver gets the team's thanks."
          confirmLabel="Send request"
          onConfirm={requestApproval}
        />
      )}
      {canApprove && status !== "completed" && (
        <ConfirmButton
          trigger={<Button><BadgeCheck /> Approve party</Button>}
          title={`Confirm ${organizerName ?? "the host"} has given this party?`}
          description="The party is marked completed, the team's thanks goes to the party giver (copying the Super Admin), and everyone gets the thank-you email 5 minutes later."
          confirmLabel="Yes, approve"
          onConfirm={() => go("completed")}
        />
      )}
      {canApprove && status === "completed" && (
        <ConfirmButton
          trigger={<Button variant="outline"><RotateCcw /> Undo approval</Button>}
          title="Undo the approval?"
          description="The party goes back to upcoming. Thank-you emails that haven't been sent yet are cancelled."
          confirmLabel="Undo approval"
          onConfirm={() => go("upcoming")}
        />
      )}
      {status === "cancelled" && <Button variant="outline" onClick={() => go("upcoming")}><RotateCcw /> Restore</Button>}
      {status === "upcoming" && (
        <ConfirmButton
          trigger={<Button variant="destructive"><XCircle /> Cancel</Button>}
          title="Cancel this party?"
          description="Everyone is told it's cancelled and pending reminders stop."
          confirmLabel="Cancel party"
          onConfirm={() => go("cancelled")}
        />
      )}
    </div>
  );
}
