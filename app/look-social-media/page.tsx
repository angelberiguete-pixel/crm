import { redirect } from "next/navigation";

// Historical link retained so old emails and bookmarks continue working.
// All current marketing links now use /empresia.
export default function FormerBrandPage(){
  redirect("/empresia");
}
