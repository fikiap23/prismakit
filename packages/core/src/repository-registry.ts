export interface RegisteredRepository {
  repository: {
    getMany: (args: {
      where?: any;
      select?: any;
      orderBy?: any;
      take?: number;
      skip?: number;
      setCache?: boolean;
    }) => Promise<any[]>;
  };
  scalarFields?: Record<string, string>;
}

export class RepositoryRegistry {
  private readonly repos = new Map<string, RegisteredRepository>();

  register(model: string, entry: RegisteredRepository): void {
    this.repos.set(model, entry);
  }

  get(model: string): RegisteredRepository | undefined {
    return this.repos.get(model);
  }

  getOrThrow(model: string): RegisteredRepository {
    const entry = this.repos.get(model);
    if (!entry) {
      throw new Error(
        `No repository registered for relation/model "${model}". Ensure the repository is created with model: '${model}' and is registered.`,
      );
    }
    return entry;
  }
}
