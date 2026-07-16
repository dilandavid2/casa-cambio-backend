import 'dotenv/config';
import { hash } from 'argon2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable obligatoria ${name}`);
  return value;
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
});
const summary = { created: [] as string[], skipped: [] as string[] };

async function createIfMissing<T>(
  label: string,
  find: () => Promise<T | null>,
  create: () => Promise<T>,
) {
  const existing = await find();
  if (existing) {
    summary.skipped.push(label);
    return existing;
  }
  const value = await create();
  summary.created.push(label);
  return value;
}

async function main() {
  const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'Dilan';
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL?.trim() || 'dilandavid2103@gmail.com'
  ).toLowerCase();
  const adminPassword = required('SEED_ADMIN_PASSWORD');
  const adminPin = required('SEED_ADMIN_PIN');
  if (adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres');
  }
  if (!/^\d{4,12}$/.test(adminPin)) {
    throw new Error('SEED_ADMIN_PIN debe contener entre 4 y 12 dígitos');
  }

  await createIfMissing(
    `Administrador ${adminEmail}`,
    () => prisma.user.findUnique({ where: { email: adminEmail } }),
    async () =>
      prisma.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          password: await hash(adminPassword),
          pinHash: await hash(adminPin),
          role: 'ADMIN',
        },
      }),
  );

  const currencies = new Map<string, { id: number }>();
  for (const item of [
    { code: 'COP', name: 'Peso colombiano' },
    { code: 'USD', name: 'Dólar estadounidense' },
    { code: 'VES', name: 'Bolívar venezolano' },
  ]) {
    const currency = await createIfMissing(
      `Moneda ${item.code}`,
      () => prisma.currency.findUnique({ where: { code: item.code } }),
      () => prisma.currency.create({ data: item }),
    );
    currencies.set(item.code, currency);
  }

  for (const name of [
    'Cambio de divisas',
    'Compra',
    'Venta',
    'Transferencia interna',
  ]) {
    await createIfMissing(
      `Tipo ${name}`,
      () => prisma.operationType.findFirst({ where: { name } }),
      () => prisma.operationType.create({ data: { name } }),
    );
  }
  for (const name of ['Creada', 'En verificación', 'Verificada', 'Completada']) {
    await createIfMissing(
      `Estado ${name}`,
      () => prisma.operationStatus.findFirst({ where: { name } }),
      () => prisma.operationStatus.create({ data: { name } }),
    );
  }

  await createIfMissing(
    'Cliente Sistema interno',
    () =>
      prisma.client.findFirst({
        where: { name: 'Sistema interno', type: 'GENERIC' },
      }),
    () =>
      prisma.client.create({
        data: { name: 'Sistema interno', type: 'GENERIC' },
      }),
  );

  console.log('Seed completado:', JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('Seed abortado sin eliminar datos:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
