export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function fileStem(path: string): string {
  const name = fileName(path);
  const extension = name.lastIndexOf('.');
  return extension > 0 ? name.slice(0, extension) : name;
}

export function parentPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : path;
}

export function joinPath(directory: string, name: string): string {
  return `${directory.replace(/\/$/, '')}/${name}`;
}

export function templateId(path: string): string {
  const normalized = fileStem(path)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  let hash = 2166136261;
  for (const character of path) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${normalized || 'indesign-template'}-${(hash >>> 0).toString(16)}`;
}
