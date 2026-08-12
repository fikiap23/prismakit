export async function seed(prisma) {
  return prisma.user.createManyAndReturn({ data: [] });
}
