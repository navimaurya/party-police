import { PartiesAdminView } from "@/components/admin/parties-view";

export default function Page(props: PageProps<"/admin/parties">) {
  return <PartiesAdminView basePath="/admin/parties" searchParams={props.searchParams} />;
}
