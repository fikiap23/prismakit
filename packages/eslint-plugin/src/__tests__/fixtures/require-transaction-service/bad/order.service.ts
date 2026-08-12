export class OrderService {
  checkout(prisma) {
    return prisma.$transaction(async () => {});
  }
}
