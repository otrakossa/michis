"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-3xl font-extrabold">🐱 michis</h1>
      <p className="text-center text-sm text-stone-400">investigación y denuncia coordinada de bots</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl bg-stone-800 p-3"
        />
        <input
          type="password" placeholder="Contraseña" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl bg-stone-800 p-3"
        />
        <button type="submit" className="btn-primary">
          Entrar
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
      <p className="text-xs text-neutral-500">El acceso es solo por invitación.</p>
    </main>
  );
}
