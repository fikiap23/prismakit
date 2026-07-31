import * as fs from 'fs';
import * as path from 'path';

import { RepositoryRegistry } from '../repository-registry';
import { getPrismaMeta } from '../schema/prisma-meta';
import { buildRelationModelCandidates } from './relation-resolver';

export interface ComposeValidationIssue {
  file: string;
  message: string;
}

export interface ValidateSelectComposeOptions {
  /** Relative path under projectRoot that contains feature modules. Default: `src/modules`. */
  modulesRoot?: string;
  /** RegExp matched against repository file paths. */
  repoFilePattern?: RegExp;
  /** RegExp matched against select/where type file paths. */
  selectFilePattern?: RegExp;
}

const DEFAULT_MODULES_ROOT = path.join('src', 'modules');
const DEFAULT_REPO_FILE_RE = /repositories\/[\w-]+\.repository\.ts$/;
const DEFAULT_SELECT_FILE_RE = /types\/(select|where)-[\w-]+\.type\.ts$/;

function listFilesRecursive(dir: string, pattern: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, pattern));
    } else if (pattern.test(entry.name) || pattern.test(full)) {
      results.push(full);
    }
  }
  return results;
}

function parseRegisteredModels(
  projectRoot: string,
  modulesRoot: string,
  repoFilePattern: RegExp,
): Map<string, string> {
  const reposDir = path.join(projectRoot, modulesRoot);
  const models = new Map<string, string>();
  const repoFiles = listFilesRecursive(reposDir, repoFilePattern);
  const metaLoaded = !!getPrismaMeta();

  for (const file of repoFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const modelMatch = content.match(/model:\s*'([^']+)'/);
    if (!modelMatch) continue;

    const hasScalar = /scalarFields:\s*/.test(content);
    // With Prisma meta, scalarFields are optional for compose.
    if (!hasScalar && !metaLoaded) continue;

    const rel = path.relative(projectRoot, file);
    models.set(rel, modelMatch[1]);
  }

  return models;
}

/** Extract relation field names from select preset object literals (heuristic). */
function extractRelationKeysFromSource(source: string): string[] {
  const keys: string[] = [];
  const relPattern =
    /^\s+([a-zA-Z][\w]*)\s*:\s*\{\s*(?:select\s*:|where\s*:)/gm;
  let match;
  while ((match = relPattern.exec(source)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

function findSelectExportsWithRelations(
  projectRoot: string,
  modulesRoot: string,
  selectFilePattern: RegExp,
): Array<{
  file: string;
  moduleDir: string;
  relationKeys: string[];
}> {
  const modulesDir = path.join(projectRoot, modulesRoot);
  const typeFiles = listFilesRecursive(modulesDir, selectFilePattern);
  const results: Array<{
    file: string;
    moduleDir: string;
    relationKeys: string[];
  }> = [];

  const modulesSeg = path.sep + path.basename(modulesRoot) + path.sep;

  for (const file of typeFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (!content.includes('Select') && !content.includes('Where')) continue;

    const relationKeys = extractRelationKeysFromSource(content);
    if (relationKeys.length === 0) continue;

    const afterModules = file.includes(modulesSeg)
      ? file.split(modulesSeg)[1]
      : path.relative(modulesDir, file);
    const moduleFolder = afterModules.split(path.sep)[0];

    results.push({
      file: path.relative(projectRoot, file),
      moduleDir: moduleFolder,
      relationKeys,
    });
  }

  return results;
}

function buildMockRegistry(registeredModels: string[]): RepositoryRegistry {
  const registry = new RepositoryRegistry();
  for (const model of registeredModels) {
    if (!model) continue;
    registry.register(model, {
      repository: { getMany: async () => [] },
    });
  }
  return registry;
}

function resolveRelationForValidate(
  relKey: string,
  registry: RepositoryRegistry,
  preferredSourceModels: string[],
): string | undefined {
  const meta = getPrismaMeta();
  if (meta) {
    for (const source of preferredSourceModels) {
      const target = meta[source]?.relations[relKey]?.targetModel;
      if (target && registry.get(target)) return target;
    }
    for (const model of Object.values(meta)) {
      const target = model.relations[relKey]?.targetModel;
      if (target && registry.get(target)) return target;
    }
  }

  const candidates = buildRelationModelCandidates(relKey);
  return candidates.find((c) => registry.get(c));
}

/**
 * Validates that modules using relational select presets have repositories
 * with `model` (+ `scalarFields` or loaded Prisma meta), and that relation
 * keys resolve via meta / aliases.
 */
export function validateSelectCompose(
  projectRoot: string,
  options: ValidateSelectComposeOptions = {},
): ComposeValidationIssue[] {
  const modulesRoot = options.modulesRoot ?? DEFAULT_MODULES_ROOT;
  const repoFilePattern = options.repoFilePattern ?? DEFAULT_REPO_FILE_RE;
  const selectFilePattern =
    options.selectFilePattern ?? DEFAULT_SELECT_FILE_RE;

  const issues: ComposeValidationIssue[] = [];
  const repoModels = parseRegisteredModels(
    projectRoot,
    modulesRoot,
    repoFilePattern,
  );
  const registeredModelKeys = [
    ...new Set([...repoModels.values()].filter((m) => m.length > 0)),
  ];
  const registry = buildMockRegistry(registeredModelKeys);

  const modulesParts = modulesRoot.split(/[/\\]/).filter(Boolean);
  const moduleFolderIndex = modulesParts.length;

  const moduleModels = new Map<string, string[]>();
  for (const [repoFile, model] of repoModels.entries()) {
    if (!model) continue;
    const parts = repoFile.split(path.sep);
    const moduleFolder = parts[moduleFolderIndex];
    if (!moduleFolder) continue;
    const list = moduleModels.get(moduleFolder) ?? [];
    list.push(model);
    moduleModels.set(moduleFolder, list);
  }

  const selectExports = findSelectExportsWithRelations(
    projectRoot,
    modulesRoot,
    selectFilePattern,
  );
  for (const { file, moduleDir, relationKeys } of selectExports) {
    const modelsInModule = moduleModels.get(moduleDir) ?? [];
    if (modelsInModule.length === 0) {
      issues.push({
        file,
        message: `Select has relations but module "${moduleDir}" has no repository with model`,
      });
      continue;
    }

    for (const relKey of relationKeys) {
      const resolved = resolveRelationForValidate(
        relKey,
        registry,
        modelsInModule,
      );
      if (!resolved) {
        const candidates = buildRelationModelCandidates(relKey);
        const metaHint = getPrismaMeta()
          ? ' (check schema meta / registered target repo)'
          : '';
        issues.push({
          file,
          message: `Relation "${relKey}" cannot be resolved to a registered repository model (candidates: ${candidates.join(', ')})${metaHint}`,
        });
      }
    }
  }

  return issues;
}

export function assertSelectComposeValid(
  projectRoot: string,
  options?: ValidateSelectComposeOptions,
): void {
  const issues = validateSelectCompose(projectRoot, options);
  if (issues.length === 0) return;

  const lines = issues.map((i) => `  - ${i.file}: ${i.message}`);
  throw new Error(`Select compose validation failed:\n${lines.join('\n')}`);
}
