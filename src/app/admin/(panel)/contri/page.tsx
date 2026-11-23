import { PartiesAdminView } from "@/components/admin/parties-view";

export default function Page(props: PageProps<"/admin/contri">) {
  return <PartiesAdminView basePath="/admin/contri" category="contri" searchParams={props.searchParams} />;
}
