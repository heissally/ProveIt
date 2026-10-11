/**
 * Discord claim rules shared by the website, the scripts and the tests.
 * The Discord Lit Action carries its own copy (actions are single files); a test
 * checks that both agree.
 */
export type RoleLabel = "Admin" | "Mod";

/** One fixed order. The action lists claimed roles in this order, so claims compare exactly. */
export const ROLE_ORDER: RoleLabel[] = ["Admin", "Mod"];

export function sortRoles(roles: string[]): RoleLabel[] {
  return ROLE_ORDER.filter((l) => roles.includes(l));
}

/**
 * What the Discord sign-in asks for: who you are, and your member info (roles) in
 * servers. Never "guilds", the list of all your servers.
 */
export const DISCORD_SCOPES = ["identify", "guilds.members.read"];
