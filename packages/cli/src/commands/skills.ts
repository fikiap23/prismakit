import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_NAMES = ['prismakit', 'prismakit-nestjs'] as const;
const RULE_NAME = 'data-access.mdc';

export type SkillsCommandOptions = {
  cwd?: string;
  /** Install into ~/.cursor/skills (all projects). Default: <cwd>/.cursor/skills */
  global?: boolean;
  /** Override project root when not using --global. */
  projectRoot?: string;
  /** Subset of skill folder names. Default: both. */
  skill?: string[];
  /** Also copy templates/cursor-rules/data-access.mdc into .cursor/rules. */
  withRules?: boolean;
  dryRun?: boolean;
  list?: boolean;
  /** Test override: directory that contains prismakit/ and prismakit-nestjs/. */
  skillsRoot?: string;
  /** Test override: path to data-access.mdc. */
  rulesPath?: string;
};

export type SkillsInstallResult = {
  dest: string;
  installed: string[];
  ruleDest?: string;
};

function isSkillsRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'prismakit', 'SKILL.md'));
}

/**
 * Walk up from the CLI entrypoint looking for bundled `skills/` (published
 * package) or the monorepo `skills/` directory.
 */
export function findSkillsRoot(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10; i++) {
    for (const candidate of [
      path.join(dir, 'skills'),
      dir,
    ]) {
      if (isSkillsRoot(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function findRulesPath(skillsRoot: string): string | undefined {
  const candidates = [
    path.join(skillsRoot, '..', 'templates', 'cursor-rules', RULE_NAME),
    path.join(skillsRoot, '..', 'rules', RULE_NAME),
    path.join(path.dirname(skillsRoot), 'rules', RULE_NAME),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function resolveHome(): string {
  return process.env.HOME || os.homedir();
}

function assertNotBuiltinSkills(dest: string): void {
  const forbidden = path.join(resolveHome(), '.cursor', 'skills-cursor');
  const resolved = path.resolve(dest);
  if (resolved === forbidden || resolved.startsWith(`${forbidden}${path.sep}`)) {
    throw new Error(
      `Refusing to install into ${resolved} (reserved for Cursor built-ins).`,
    );
  }
}

function cliStartDir(): string {
  try {
    const url = import.meta.url;
    if (typeof url === 'string' && url.length > 0) {
      return path.dirname(fileURLToPath(url));
    }
  } catch {
    // CJS bundle has an empty import.meta
  }
  return process.cwd();
}

export function runSkills(options: SkillsCommandOptions = {}): SkillsInstallResult {
  const skillsRoot =
    options.skillsRoot ??
    findSkillsRoot(cliStartDir()) ??
    findSkillsRoot(process.cwd());
  if (!skillsRoot) {
    throw new Error(
      'Could not find PrismaKit skills. Reinstall @prismakit/cli or clone fikiap23/prismakit.',
    );
  }

  const available = SKILL_NAMES.filter((name) =>
    fs.existsSync(path.join(skillsRoot, name, 'SKILL.md')),
  );
  if (available.length === 0) {
    throw new Error(`No skills found in ${skillsRoot}`);
  }

  const requested = options.skill?.length
    ? options.skill.map((s) => s.trim()).filter(Boolean)
    : [...available];

  for (const name of requested) {
    if (!available.includes(name as (typeof SKILL_NAMES)[number])) {
      throw new Error(
        `Unknown skill "${name}". Available: ${available.join(', ')}`,
      );
    }
  }

  if (options.list) {
    console.log(`Skills in ${skillsRoot}:`);
    for (const name of available) {
      console.log(`  - ${name}`);
    }
    return { dest: skillsRoot, installed: [] };
  }

  const cwd = options.cwd ?? process.cwd();
  const dest = options.global
    ? path.join(resolveHome(), '.cursor', 'skills')
    : path.join(
        path.resolve(options.projectRoot ?? cwd),
        '.cursor',
        'skills',
      );

  assertNotBuiltinSkills(dest);

  if (!options.dryRun) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const installed: string[] = [];
  for (const name of requested) {
    const src = path.join(skillsRoot, name);
    const target = path.join(dest, name);
    if (options.dryRun) {
      console.log(`[dry-run] would install ${name} -> ${target}`);
    } else {
      fs.rmSync(target, { recursive: true, force: true });
      copyDir(src, target);
      console.log(`Installed ${name} -> ${target}`);
    }
    installed.push(name);
  }

  let ruleDest: string | undefined;
  if (options.withRules) {
    const rulesSrc = options.rulesPath ?? findRulesPath(skillsRoot);
    if (!rulesSrc) {
      throw new Error(`Could not find ${RULE_NAME} next to skills.`);
    }
    const rulesDir = options.global
      ? path.join(resolveHome(), '.cursor', 'rules')
      : path.join(path.resolve(options.projectRoot ?? cwd), '.cursor', 'rules');
    ruleDest = path.join(rulesDir, RULE_NAME);
    if (options.dryRun) {
      console.log(`[dry-run] would install rule -> ${ruleDest}`);
    } else {
      fs.mkdirSync(rulesDir, { recursive: true });
      fs.copyFileSync(rulesSrc, ruleDest);
      console.log(`Installed rule -> ${ruleDest}`);
    }
  }

  const scope = options.global
    ? 'global (~/.cursor/skills)'
    : 'project (.cursor/skills)';
  if (options.dryRun) {
    console.log(`Dry-run complete (${scope}).`);
  } else if (options.global) {
    console.log(`Done. Skills are available in all Cursor projects on this machine (${scope}).`);
  } else {
    console.log(
      `Done. Commit .cursor/skills so the team shares the same agent contract (${scope}).`,
    );
  }

  return { dest, installed, ruleDest };
}
