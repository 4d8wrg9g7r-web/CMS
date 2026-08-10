import type { Metadata } from "next";

/** Shared by every authenticated-only or transient account-flow page (login, signup, password reset, onboarding, admin) -- none of these should ever appear in search results. */
export const noIndexMetadata: Metadata = { robots: { index: false, follow: false } };
