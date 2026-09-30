import { FormEvent, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
    [],
  );

  const mutation = trpc.auth.resetPassword.useMutation();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("O link de redefinição não é válido.");
      return;
    }

    if (password.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }

    try {
      await mutation.mutateAsync({ token, password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir a senha.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-5 rounded-lg bg-white p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">Criar nova senha</h1>
          <p className="text-sm text-muted-foreground">
            Escolha uma nova senha para acessar sua conta.
          </p>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">
              Sua senha foi redefinida com sucesso.
            </p>
            <Button type="button" className="w-full" onClick={() => navigate("/login")}>
              Ir para o login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Nova senha"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Ocultar nova senha" : "Mostrar nova senha"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            <div className="relative">
              <Input
                type={showConfirmation ? "text" : "password"}
                placeholder="Confirme a nova senha"
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmation(value => !value)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showConfirmation ? "Ocultar confirmação" : "Mostrar confirmação"}
              >
                {showConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Redefinir senha"}
            </Button>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full text-center text-sm text-muted-foreground underline"
            >
              Voltar para o login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
