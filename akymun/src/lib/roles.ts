export const ROLE_PERMS: Record<string, string[]> = {
  viewer: ["view_applications"],
  editor: ["view_applications", "export", "manage_applications", "assign_delegate"],
  admin: [
    "view_applications",
    "export",
    "manage_applications",
    "assign_delegate",
    "manage_users",
  ],
  owner: [
    "view_applications",
    "export",
    "manage_applications",
    "assign_delegate",
    "manage_users",
  ],
};

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  permissions: string[];
};
