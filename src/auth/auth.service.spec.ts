import { hash } from 'argon2';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
  const service = new AuthService(prisma as never, jwt as never);

  beforeEach(() => jest.clearAllMocks());

  it('authenticates an active user with an Argon2 password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 7,
      name: 'Admin',
      email: 'admin@example.com',
      password: await hash('secure-password'),
      pinHash: await hash('1234'),
      role: 'ADMIN',
      isActive: true,
    });

    const result = await service.login('ADMIN@example.com', 'secure-password');

    expect(result.accessToken).toBe('signed-token');
    expect(result.user).toEqual({
      id: 7,
      name: 'Admin',
      email: 'admin@example.com',
      role: 'ADMIN',
      isActive: true,
    });
    expect(result.user).not.toHaveProperty('password');
  });

  it('rejects an invalid password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      password: await hash('secure-password'),
      isActive: true,
    });
    await expect(service.login('admin@example.com', 'wrong-password')).rejects.toThrow(
      'Credenciales inválidas',
    );
  });

  it('rejects an inactive user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      password: await hash('secure-password'),
      isActive: false,
    });
    await expect(
      service.login('admin@example.com', 'secure-password'),
    ).rejects.toThrow('Credenciales inválidas');
  });
});
