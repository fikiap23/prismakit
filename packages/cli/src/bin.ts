import { runGenerate } from './commands/generate';
import { runValidate } from './commands/validate';
import { runSkills } from './commands/skills';

function printHelp(): void {
  console.log(`prismakit — PrismaKit CLI

Usage:
  prismakit generate <name> [--cache] [--full] [--helpers] [--dto] [--route <path>] [--prisma-import <path>] [--dry-run]
  prismakit validate [--schema <path>] [--auto-register] [--no-assert]
  prismakit skills [--global] [--with-rules] [--skill <name>] [--project <path>] [--list] [--dry-run]
  prismakit help

By default, generate writes only the repository file.
Pass --full for a Nest module (controller, service, types).
Pass --helpers / --dto with --full for helpers and Swagger DTOs.

Examples:
  prismakit generate product --cache
  prismakit generate product --cache --full --helpers --dto --route products
  prismakit validate --auto-register
  prismakit skills
  prismakit skills --global
  prismakit skills --with-rules
`);
}

function parseArgs(argv: string[]): {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '-g') {
      flags.global = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function main(): void {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  try {
    switch (command) {
      case 'generate':
      case 'gen': {
        const name = positional[0];
        if (!name) {
          console.error('Missing module name. Usage: prismakit generate <name>');
          process.exitCode = 1;
          return;
        }
        runGenerate({
          name,
          cache: !!flags.cache,
          full: !!flags.full,
          helpers: !!flags.helpers,
          dto: !!flags.dto,
          route:
            typeof flags.route === 'string' ? flags.route : undefined,
          prismaImport:
            typeof flags['prisma-import'] === 'string'
              ? flags['prisma-import']
              : undefined,
          dryRun: !!flags['dry-run'],
        });
        break;
      }
      case 'validate': {
        runValidate({
          assert: !flags['no-assert'],
          schemaPath:
            typeof flags.schema === 'string' ? flags.schema : undefined,
          autoRegisterModels: !!flags['auto-register'],
        });
        break;
      }
      case 'skills':
      case 'skill': {
        const skillFlag = flags.skill;
        runSkills({
          global: !!flags.global,
          withRules: !!flags['with-rules'],
          dryRun: !!flags['dry-run'],
          list: !!flags.list,
          projectRoot:
            typeof flags.project === 'string' ? flags.project : undefined,
          skill:
            typeof skillFlag === 'string'
              ? skillFlag.split(',').map((s) => s.trim()).filter(Boolean)
              : undefined,
        });
        break;
      }
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 1;
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

main();
