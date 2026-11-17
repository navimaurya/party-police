import { EmptyState } from "@/components/shared/empty-state";
import { LinkButton } from "@/components/shared/link-button";

export default function NotFound() {
  return (
    <EmptyState emoji="🕵️" message="Party not found. Maybe it was just a rumour... or someone is hiding it from the Committee.">
      <LinkButton href="/parties" variant="outline" size="sm">Back to parties</LinkButton>
    </EmptyState>
  );
}
