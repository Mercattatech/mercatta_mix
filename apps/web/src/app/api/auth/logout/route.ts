import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";

export async function POST() {
  await endSession();
  return NextResponse.redirect(`${serverEnv().APP_URL}/login`, 303);
}
