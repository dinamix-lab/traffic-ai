"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useDemo } from "./providers";
export default function WorkspaceLink({
  href,
  ...props
}: ComponentProps<typeof Link>) {
  const { workspace } = useDemo();
  if (typeof href === "string" && href.startsWith("/") && workspace) {
    const url = new URL(href, "http://internal");
    if (!url.searchParams.has("workspace"))
      url.searchParams.set("workspace", workspace.id);
    href = url.pathname + url.search + url.hash;
  }
  return <Link href={href} {...props} />;
}
