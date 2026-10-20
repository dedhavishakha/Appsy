import type { ReactNode } from "react";
import { Pressable } from "react-native";
import type { LinkValue } from "@appsy/app-config";
import { linkLabel, openLink } from "@/lib/links";

// Makes its content open a link when tapped; without a link, it's just the content.
export function Linked({
  link,
  label,
  children,
}: {
  link: LinkValue | null;
  label?: string;
  children: ReactNode;
}) {
  if (!link) return children;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label || linkLabel(link)}
      onPress={() => openLink(link)}
    >
      {children}
    </Pressable>
  );
}
