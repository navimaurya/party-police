import { PartiesAdminView } from "@/components/admin/parties-view";

export default function Page(props: PageProps<"/admin/special">) {
  return <PartiesAdminView basePath="/admin/special" category="special" searchParams={props.searchParams} />;
}
