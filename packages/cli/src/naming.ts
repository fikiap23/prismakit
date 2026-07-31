export interface ModuleNames {
  kebab: string;
  camel: string;
  pascal: string;
  repoModel: string;
  route: string;
}

const KEBAB_NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function assertKebabName(name: string): void {
  if (!KEBAB_NAME_RE.test(name)) {
    throw new Error(
      `Invalid module name "${name}". Use kebab-case (e.g. product, blog-post).`,
    );
  }
}

function kebabToPascal(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function kebabToCamel(kebab: string): string {
  const pascal = kebabToPascal(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function resolveNames(kebab: string, route?: string): ModuleNames {
  assertKebabName(kebab);
  const pascal = kebabToPascal(kebab);
  const camel = kebabToCamel(kebab);
  return {
    kebab,
    camel,
    pascal,
    repoModel: camel,
    route: route ?? kebab,
  };
}
