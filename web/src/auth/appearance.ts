/**
 * Clerk's sign-in, sign-up and account components drawn in the app's own tokens (src/styles/tokens.css).
 * The tokens are CSS variables that [data-theme="dark"] redefines, so one appearance serves both themes.
 * Borders are left to Clerk, which draws them from colorNeutral at low opacity.
 */
export const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "var(--clerk-primary)",
    colorPrimaryForeground: "var(--accent-fg)",
    colorDanger: "var(--danger)",
    colorSuccess: "var(--supported)",
    colorForeground: "var(--fg)",
    colorMutedForeground: "var(--fg-muted)",
    colorMuted: "var(--surface-2)",
    colorBackground: "var(--surface)",
    colorInput: "var(--bg)",
    colorInputForeground: "var(--fg)",
    colorNeutral: "var(--fg)",
    colorRing: "var(--accent-line)",
    fontFamily: "var(--font-sans)",
    borderRadius: "var(--radius-control)",
  },
};
