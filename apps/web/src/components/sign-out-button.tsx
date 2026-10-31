"use client";

import { Button } from "@/components/ui";

/** Formulário comum (POST): funciona até sem JavaScript e a rota apaga cookie e sessão. */
export function SignOutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <Button id="sign-out" type="submit" variant="ghost" size="sm">
        Sair
      </Button>
    </form>
  );
}
