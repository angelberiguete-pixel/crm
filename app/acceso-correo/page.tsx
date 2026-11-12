import { redirect } from "next/navigation";

/** Password-only access. Legacy email-link URL cannot initiate OTP sign-in. */
export default function EmailAccessRedirect() {
  redirect("/login");
}
