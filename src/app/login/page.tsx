import { redirect } from "next/navigation";
import { currentUser } from "@/auth/server";
import { LoginForm } from "@/features/auth/login-form";
export const metadata = { title: "Entrar" };
export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return <LoginForm />;
}
