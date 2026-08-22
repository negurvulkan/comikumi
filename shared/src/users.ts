import { z } from "zod";

/** Projekt-Rolle, aufsteigend privilegiert. Siehe PROJECT_ROLE_RANK für Vergleiche
 * ("mindestens Rolle X"). */
export const ProjectRoleSchema = z.enum(["viewer", "translator", "letterer", "admin"]);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

/** Höherer Wert = mehr Rechte — Grundlage für requireProjectRole()s Mindestrollen-
 * Prüfung (server/src/lib/auth.ts) und den Client-Hook useProjectRole.ts. */
export const PROJECT_ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  translator: 1,
  letterer: 2,
  admin: 3,
};

export function hasAtLeastRole(role: ProjectRole, min: ProjectRole): boolean {
  return PROJECT_ROLE_RANK[role] >= PROJECT_ROLE_RANK[min];
}

/** Ein Mitglied einer einzelnen Projektdatei — lebt in ProjectFileSchema.members
 * (shared/src/project.ts), zieht also portabel mit der Projektdatei um. */
export const ProjectMemberSchema = z.object({
  userId: z.string(),
  role: ProjectRoleSchema,
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;
export const ProjectMemberListSchema = z.array(ProjectMemberSchema);

/** Ein serverweiter Account — lebt in users.json (DATA_DIR, siehe server/src/lib/paths.ts),
 * nicht in einer Projektdatei (ein Account existiert unabhängig davon, welche Projekte
 * er sehen darf). */
export const UserAccountSchema = z.object({
  id: z.string(),
  username: z.string().trim().min(1).max(60),
  /** "<saltHex>:<hashHex>" — siehe server/src/lib/authStore.ts's hashPassword/verifyPassword. */
  passwordHash: z.string(),
  /** Serverweiter Admin: Nutzerverwaltung + Projekt-Umschalter-Aktionen (anlegen/
   * löschen/archivieren/browsen), UND impliziter Admin-Zugriff auf jedes einzelne
   * Projekt unabhängig von dessen `members`-Liste — verhindert das Henne-Ei-Problem
   * beim allerersten Account (der sonst erst sich selbst in jedes Projekt einladen
   * müsste, bevor er irgendetwas sehen könnte). */
  isSystemAdmin: z.boolean().default(false),
  createdAt: z.string(),
});
export type UserAccount = z.infer<typeof UserAccountSchema>;
export const UserAccountListSchema = z.array(UserAccountSchema);

/** Öffentliche Sicht auf einen Account — passwordHash darf nie über die API nach
 * außen gehen (siehe routes/auth.ts's toPublicUser()). */
export type PublicUser = Omit<UserAccount, "passwordHash">;
