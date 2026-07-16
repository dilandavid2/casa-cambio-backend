import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    let passwordMatches = false;
    if (user?.isActive) {
      try {
        passwordMatches = await verify(user.password, password);
      } catch {
        passwordMatches = false;
      }
    }
    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role }),
      user: this.toPublicUser(user),
    };
  }

  toPublicUser(user: {
    id: number;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }
}
