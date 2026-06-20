import { CanActivate, ExecutionContext, Injectable, ForbiddenException, SetMetadata, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES_KEY = 'requiredRoles';

/**
 * Declares the roles authorized to invoke a route or controller. The global
 * {@link RolesGuard} enforces it AFTER authentication, so it is an explicit
 * authorization policy on top of "is this a valid principal".
 *
 *   @Roles('admin')
 *   @Controller('api/admin')
 *   class AdminResource {}
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No role requirement declared -> authentication alone is sufficient.
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const principalRoles: unknown = request.user?.roles;
    const roles = Array.isArray(principalRoles) ? principalRoles : [];

    const allowed = required.some((r) => roles.includes(r));
    if (!allowed) {
      throw new ForbiddenException(
        `Requires one of role(s): ${required.join(', ')}`,
      );
    }
    return true;
  }
}
