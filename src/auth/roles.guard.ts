import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userIdHeader = request.headers['x-user-id'];

    if (!userIdHeader) {
      throw new UnauthorizedException(
        'Falta el header x-user-id para validar permisos',
      );
    }

    const userId = Number(userIdHeader);

    if (Number.isNaN(userId)) {
      throw new UnauthorizedException('x-user-id debe ser numérico');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    request.currentUser = user;

    if (!requiredRoles.includes(user.role)) {
      throw new UnauthorizedException(
        `El rol ${user.role} no tiene permiso para esta acción`,
      );
    }

    return true;
  }
}
