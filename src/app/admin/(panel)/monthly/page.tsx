import { PartiesAdminView } from "@/components/admin/parties-view";

export default function Page(props: PageProps<"/admin/monthly">) {
  return <PartiesAdminView basePath="/admin/monthly" category="monthly" searchParams={props.searchParams} />;
}
