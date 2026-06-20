import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, SetMetadata, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class OidcAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

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
        request.user = decoded;
      } else {
        throw new UnauthorizedException('Invalid token payload');
      }
      return true;
    } catch (err: any) {
      throw new UnauthorizedException(err.message || 'Invalid or expired token');
    }
  }
}
