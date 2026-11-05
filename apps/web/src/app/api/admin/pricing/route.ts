import { z } from "zod";
import { getPricingConfig, updatePricingConfig } from "@mercatta/server";
import { handle } from "@/lib/api";
import { requireApiAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

const body = z.object({
  perVideoCredits: z.number().int().min(1).max(10_000).optional(),
  packageSmallDiscount: z.number().min(0).max(100).optional(),
  packageMediumDiscount: z.number().min(0).max(100).optional(),
  packageTotalDiscount: z.number().min(0).max(100).optional(),
});

export function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return getPricingConfig(getDb());
  });
}

export function POST(req: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const input = body.parse(await req.json());
    return updatePricingConfig(getDb(), input);
  });
}

