import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, SetMetadata, Inject, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import { MEMBERSHIP_VERIFIER, normalizePrincipal } from './RequestPrincipal.js';
import type { MembershipVerifier } from './RequestPrincipal.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class OidcAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Optional()
    @Inject(MEMBERSHIP_VERIFIER)
    private readonly membershipVerifier?: MembershipVerifier,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    if (request.user) {
      return true;
    }
    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    const token = parts[1];
    const secret = process.env.JWT_SECRET || 'super-secret-key-change-me';

    try {
      const decoded = jwt.verify(token, secret);
      if (typeof decoded === 'object' && decoded !== null) {
        request.user = normalizePrincipal(decoded as Record<string, unknown>);
      } else {
        throw new UnauthorizedException('Invalid token payload');
      }

      if (this.membershipVerifier) {
        const tenantId = request.user.tenant_id;
        if (!tenantId) {
          throw new UnauthorizedException('No tenant claim present in token');
        }
        const subject = request.user.sub;
        return this.membershipVerifier.resolveActiveMember(tenantId, subject).then((member) => {
          if (!member) {
            throw new UnauthorizedException('Principal is not an active member of this tenant');
          }
          request.user.id = member.principalId;
          return true;
        });
      }

      return true;
    } catch (err: any) {
      throw new UnauthorizedException(err.message || 'Invalid or expired token');
    }
  }
}
