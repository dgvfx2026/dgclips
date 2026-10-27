import React from "react";

export function navigate(href: string) {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}
export function useRouter() { return { push: navigate, replace: navigate, refresh: () => window.location.reload(), back: () => window.history.back() }; }
export function Link({ href, children, onClick, ...props }: React.ComponentProps<"a"> & { href: string }) {
  return <a href={href} {...props} onClick={(event) => {
    onClick?.(event);
    if (!event.defaultPrevented && href.startsWith("/") && !event.ctrlKey && !event.metaKey) { event.preventDefault(); navigate(href); }
  }}>{children}</a>;
}
export function Image({ fill, sizes, priority: _priority, ...props }: React.ComponentProps<"img"> & { fill?: boolean; priority?: boolean }) {
  return <img {...props} sizes={sizes} style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...props.style } : props.style} />;
}
const localSession = { data: { user: { id: "local", name: "Seu computador", email: "" } }, isPending: false };
export function useSession() { return localSession; }
export async function signOut() { return; }
