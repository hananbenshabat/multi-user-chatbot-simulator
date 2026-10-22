import * as core from '../core';
import type { Profile, User } from '../types';

/** A user's name with their role's icon in front (★ Lead), as text inside any element. */
export function UserName({ user, profile }: { user: User; profile: Profile }) {
  const icon = core.roleDef(profile, user.role)?.icon;
  return (
    <>
      {icon && <span className="cbs-role-icon">{icon}</span>}
      {user.name}
    </>
  );
}
