import { Construction } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center shadow-card">
        <Construction className="mx-auto size-8 text-accent" aria-hidden />
        <h1 className="mt-3 font-display text-lg font-semibold text-text">Página não encontrada</h1>
        <p className="mt-1 text-sm text-text-2">O endereço solicitado não existe.</p>
      </div>
    </main>
  );
}
