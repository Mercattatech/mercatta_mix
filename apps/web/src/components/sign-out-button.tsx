"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      id="sign-out"
      variant="ghost"
      size="sm"
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sair
    </Button>
  );
}
