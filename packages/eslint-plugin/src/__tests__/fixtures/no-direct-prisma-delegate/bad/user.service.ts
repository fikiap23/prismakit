export class UserService {
  load() {
    return this.prisma.user.findMany();
  }
}
