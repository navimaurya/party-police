import { fail, route } from "@/lib/api/handler";
import { getAdmin } from "@/lib/auth";
import { verifyFileSignature } from "@/lib/signed-url";
import { statStoredFile, storedFileWebStream } from "@/lib/storage";
import { getFileForAccess } from "@/services/bill.service";

type Ctx = { params: Promise<{ fileId: string }> };

function contentDisposition(type: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Secure file access. Order of checks:
 *  1. fileId must be a valid ObjectId (no paths are ever accepted from the client)
 *  2. the file record and its event must exist
 *  3. access granted if: file is public AND its event is public,
 *     OR a valid admin session, OR a valid unexpired signature for this file + op
 *  4. the storage key is resolved inside the storage root only
 */
export const GET = route<Ctx>(async (req, ctx) => {
  const { fileId } = await ctx.params;
  if (!/^[a-f\d]{24}$/.test(fileId)) return fail(404, "NOT_FOUND", "File not found");
  const url = new URL(req.url);
  const op = url.searchParams.get("op") === "download" ? "download" : "view";
  const sig = url.searchParams.get("sig");
  const exp = url.searchParams.get("exp");

  const found = await getFileForAccess(fileId);
  if (!found) return fail(404, "NOT_FOUND", "File not found");
  const { bill, event } = found;

  const isPublic = bill.isPublic && event.publicVisibility;
  let authorized = isPublic;
  if (!authorized && sig) authorized = verifyFileSignature(fileId, url.searchParams.get("op") ?? "view", exp, sig);
  if (!authorized) authorized = !!(await getAdmin());
  if (!authorized) {
    return sig
      ? fail(403, "LINK_INVALID", "This link has expired or is invalid. Ask the Party Committee for a fresh one 🔒")
      : fail(404, "NOT_FOUND", "File not found");
  }

  const stat = await statStoredFile(bill.storageKey);
  if (!stat) return fail(404, "NOT_FOUND", "File is missing from storage");

  return new Response(storedFileWebStream(bill.storageKey), {
    status: 200,
    headers: {
      "Content-Type": bill.mimeType,
      "Content-Length": String(stat.size),
      "Content-Disposition": contentDisposition(op === "download" ? "attachment" : "inline", bill.originalFileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": isPublic ? "public, max-age=300" : "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
});
