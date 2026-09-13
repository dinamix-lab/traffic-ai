import Link from "@/components/workspace-link";
import { WorkspaceFrame } from "@/components/workspace-frame";
export const metadata = { title: "Acesso restrito" };
export default function Page() {
  return (
    <WorkspaceFrame administrative>
      <section className="panel empty">
        <h1>Acesso restrito</h1>
        <p>Você não tem permissão para acessar esta área ou este workspace.</p>
        <Link className="button primary" href="/">
          Voltar à visão geral
        </Link>
      </section>
    </WorkspaceFrame>
  );
}
