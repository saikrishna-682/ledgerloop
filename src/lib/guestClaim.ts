/** localStorage key set by the Auth page right before a guest switches to
 *  real sign-in, and consumed once by SeedOnMount (main.tsx) to move the
 *  guest's data onto the new account. Kept in its own module (rather than
 *  Auth.tsx) so importing it doesn't defeat that page's lazy-loading. */
export const PENDING_GUEST_CLAIM_KEY = "pendingGuestClaim";
