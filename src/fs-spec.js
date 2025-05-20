/* fs.mcp.js – robust, alias-friendly FS wrapper
   -------------------------------------------------------------- */
import { nanoid }         from 'nanoid';
import { promises as fs } from 'node:fs';
import path               from 'node:path';
import { z }              from 'zod';

const ROOT = path.resolve(process.env.FS_ROOT ?? process.cwd());

/* ───────── helpers ───────────────────────────────────────────── */
const safe = (rel) => {
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT)) throw new Error('Path escapes project root');
  return abs;
};

const statEntry = async (abs) => {
  const s = await fs.stat(abs);
  return {
    name   : path.basename(abs),
    type   : s.isFile()      ? 'file'
           : s.isDirectory() ? 'dir'
           : 'other',
    size   : s.size,
    mtimeMs: s.mtimeMs,
  };
};

const asResult = (x) => ({
  content: [{ type: 'text', text: typeof x === 'string'
    ? x
    : JSON.stringify(x, null, 2) }],
});

/* ───────── common scalars ───────────────────────────────────── */
const Encoding = z
  .enum(['utf8', 'utf-8', 'base64'])
  .transform((e) => (e === 'utf-8' ? 'utf8' : e))
  .default('utf8');

/* ───────── parameter shapes (raw objects, **not** z.object) ─── */
const Ls      = { path: z.string().default('.')
                           .describe('Directory to list - project-root-relative.') };

const Read    = {
  path    : z.string().describe('File path.'),
  encoding: Encoding.describe('utf8 | base64 (utf-8 alias accepted).').optional(),
};

const Write   = {
  path    : z.string().describe('Target file path.'),
  data    : z.string().default('').describe('String / base64 payload.'),
  encoding: Encoding.optional(),
  append  : z.boolean().default(false)
            .describe('true → append, false → overwrite').optional(),
};

const Mkdir   = {
  path     : z.string().describe('Directory to create.'),
  recursive: z.boolean().default(true)
              .describe('Create parent dirs.').optional(),
};

const Rename  = {
  from: z.string().describe('Source.'),
  to  : z.string().describe('Destination / new name.'),
};

const Remove  = {
  path     : z.string().describe('File/dir to delete.'),
  recursive: z.boolean().default(false)
              .describe('Recursive if dir.').optional(),
};

/* ───────── spec object ───────────────────────────────────────── */
export const fsSpec = {
  id         : 'fs',
  instanceId : nanoid(),
  description: 'Local filesystem utilities: ls, readFile, writeFile, mkdir, rename, rm.',

  tools: [
    /* ls -------------------------------------------------------- */
    {
      name       : 'ls',
      description: 'List directory contents.',
      parameters : Ls,
      async execute({ path: rel = '.' }) {
        const abs      = safe(rel);
        const entries  = await fs.readdir(abs);
        const detailed = await Promise.all(entries.map((n) => statEntry(path.join(abs, n))));
        return asResult(detailed);
      },
    },

    /* readFile -------------------------------------------------- */
    {
      name       : 'readFile',
      description: 'Read file – utf8 or base64.',
      parameters : Read,
      async execute({ path: rel, encoding = 'utf8' }) {
        const buf = await fs.readFile(safe(rel));
        return asResult(
          encoding === 'utf8' ? buf.toString('utf8') : buf.toString('base64'),
        );
      },
    },

    /* writeFile ------------------------------------------------- */
    {
      name       : 'writeFile',
      description: 'Write / append data to file.',
      parameters : Write,
      async execute({ path: rel, data = '', encoding = 'utf8', append = false }) {
        const buf = encoding === 'utf8'
          ? Buffer.from(data, 'utf8')
          : Buffer.from(data, 'base64');
        await fs.writeFile(safe(rel), buf, { flag: append ? 'a' : 'w' });
        return asResult('ok');
      },
    },

    /* mkdir ----------------------------------------------------- */
    {
      name       : 'mkdir',
      description: 'Create directory.',
      parameters : Mkdir,
      async execute({ path: rel, recursive = true }) {
        await fs.mkdir(safe(rel), { recursive });
        return asResult('ok');
      },
    },

    /* rename ---------------------------------------------------- */
    {
      name       : 'rename',
      description: 'Move / rename file or dir.',
      parameters : Rename,
      async execute({ from, to }) {
        await fs.rename(safe(from), safe(to));
        return asResult('ok');
      },
    },

    /* rm -------------------------------------------------------- */
    {
      name       : 'rm',
      description: 'Delete file or dir.',
      parameters : Remove,
      async execute({ path: rel, recursive = false }) {
        const abs = safe(rel);
        const s   = await fs.stat(abs);
        if (s.isDirectory()) await fs.rm(abs, { recursive, force: true });
        else                 await fs.unlink(abs);
        return asResult('ok');
      },
    },
  ],
};

export default fsSpec;
