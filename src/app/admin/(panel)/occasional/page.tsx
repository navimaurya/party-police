import { PartiesAdminView } from "@/components/admin/parties-view";

export default function Page(props: PageProps<"/admin/occasional">) {
  return <PartiesAdminView basePath="/admin/occasional" category="occasional" searchParams={props.searchParams} />;
}
