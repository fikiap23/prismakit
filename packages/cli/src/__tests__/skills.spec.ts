import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { findSkillsRoot, runSkills } from '../commands/skills';

const repoSkills = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../skills',
);

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismakit-skills-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('findSkillsRoot', () => {
  it('finds bundled or monorepo skills/ from this test file', () => {
    const found = findSkillsRoot(path.dirname(fileURLToPath(import.meta.url)));
    expect(found).toBeTruthy();
    expect(fs.existsSync(path.join(found!, 'prismakit', 'SKILL.md'))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(found!, 'prismakit-nestjs', 'SKILL.md')),
    ).toBe(true);
  });
});

describe('runSkills', () => {
  it('lists bundled skills', () => {
    const result = runSkills({ list: true, skillsRoot: repoSkills });
    expect(result.installed).toEqual([]);
    expect(result.dest).toBe(repoSkills);
  });

  it('installs both skills into a project .cursor/skills', () => {
    const cwd = tmpDir();
    const result = runSkills({ cwd, skillsRoot: repoSkills });
    expect(result.installed).toEqual(['prismakit', 'prismakit-nestjs']);
    expect(
      fs.existsSync(path.join(cwd, '.cursor/skills/prismakit/SKILL.md')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(cwd, '.cursor/skills/prismakit-nestjs/SKILL.md'),
      ),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(cwd, '.cursor/skills/prismakit/SKILL.md'),
        'utf-8',
      ),
    ).toContain('name: prismakit');
  });

  it('installs a single skill and overwrites on re-run', () => {
    const cwd = tmpDir();
    runSkills({ cwd, skillsRoot: repoSkills, skill: ['prismakit'] });
    const skillFile = path.join(cwd, '.cursor/skills/prismakit/SKILL.md');
    fs.appendFileSync(skillFile, '\n# dirty\n');
    runSkills({ cwd, skillsRoot: repoSkills, skill: ['prismakit'] });
    expect(fs.readFileSync(skillFile, 'utf-8')).not.toContain('# dirty');
    expect(
      fs.existsSync(path.join(cwd, '.cursor/skills/prismakit-nestjs')),
    ).toBe(false);
  });

  it('dry-run does not write files', () => {
    const cwd = tmpDir();
    runSkills({ cwd, skillsRoot: repoSkills, dryRun: true });
    expect(fs.existsSync(path.join(cwd, '.cursor'))).toBe(false);
  });

  it('copies the data-access rule with --with-rules', () => {
    const cwd = tmpDir();
    const rulesPath = path.resolve(
      repoSkills,
      '../templates/cursor-rules/data-access.mdc',
    );
    const result = runSkills({
      cwd,
      skillsRoot: repoSkills,
      withRules: true,
      rulesPath,
      skill: ['prismakit'],
    });
    expect(result.ruleDest).toBe(
      path.join(cwd, '.cursor/rules/data-access.mdc'),
    );
    expect(fs.existsSync(result.ruleDest!)).toBe(true);
    expect(fs.readFileSync(result.ruleDest!, 'utf-8')).toContain(
      'repository-only',
    );
  });

  it('rejects unknown skill names', () => {
    expect(() =>
      runSkills({
        cwd: tmpDir(),
        skillsRoot: repoSkills,
        skill: ['nope'],
      }),
    ).toThrow(/Unknown skill/);
  });
});
