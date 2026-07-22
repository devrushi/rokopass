import { User } from "@prisma/client";

export type PublicUser = Omit<User, "passwordHash">;

export function serializeUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
