import { nanoid }         from 'nanoid';
import { promises as fs } from 'node:fs';
import path               from 'node:path';
import { z }              from 'zod';

const ROOT = path.resolve(process.env.FS_ROOT ?? process.cwd());

/* ───────── helpers ─────────────────────────────────────────────────── */
const safe = (rel) => {
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT)) throw new Error('Path escapes project root');
  return abs;
};

const statEntry = async (abs) => {
  const s = await fs.stat(abs);
  return {
    name   : path.basename(abs),
    type   : s.isFile() ? 'file'
           : s.isDirectory() ? 'dir'
           : 'other',
    size   : s.size,
    mtimeMs: s.mtimeMs,
  };
};

const asResult = (text) => ({
  content: [{ type: 'text', text: typeof text === 'string'
                                   ? text
                                   : JSON.stringify(text, null, 2) }],
});

/* ───────── parameter shapes ────────────────────────────────────────── */
const LsShape = {
  path: z.string().default('.')
         .describe('Directory to list, relative to project root.'),
};

const ReadFileShape = {
  path    : z.string().describe('File path, relative to project root.'),
  encoding: z.enum(['utf8', 'base64']).default('utf8')
             .describe('Decoding for file contents.'),
};

const WriteFileShape = {
  path    : z.string().describe('Target file path.'),
  data    : z.string().describe('Raw text or base64-encoded bytes.'),
  encoding: z.enum(['utf8', 'base64']).default('utf8')
             .describe('Interpretation of “data”.'),
  append  : z.boolean().optional()
             .describe('If true, append instead of overwrite.'),
};

const MkdirShape = {
  path     : z.string().describe('Directory path to create.'),
  recursive: z.boolean().default(true)
              .describe('Create parent folders as needed.'),
};

const RenameShape = {
  from: z.string().describe('Original path.'),
  to  : z.string().describe('New path / filename.'),
};

const RmShape = {
  path     : z.string().describe('Path to remove.'),
  recursive: z.boolean().default(false)
              .describe('If true and a directory, remove recursively.'),
};

/* ───────── spec object ─────────────────────────────────────────────── */
export const fsSpec = {
  id         : 'fs',
  instanceId : nanoid(),
  description: 'Local filesystem tools: ls, readFile, writeFile, mkdir, rename, rm.',

  tools: [
    /* ls -------------------------------------------------------------- */
    {
      name       : 'ls',
      description: 'List files / directories in a path.',
      parameters : LsShape,
      async execute({ path: rel = '.' }) {
        const abs      = safe(rel);
        const entries  = await fs.readdir(abs);
        const detailed = await Promise.all(
          entries.map((n) => statEntry(path.join(abs, n))),
        );
        return asResult(detailed);
      },
    },

    /* readFile -------------------------------------------------------- */
    {
      name       : 'readFile',
      description: 'Read a text or binary file.',
      parameters : ReadFileShape,
      async execute({ path: rel, encoding = 'utf8' }) {
        const buf = await fs.readFile(safe(rel));
        return asResult(
          encoding === 'utf8' ? buf.toString('utf8') : buf.toString('base64'),
        );
      },
    },

    /* writeFile ------------------------------------------------------- */
    {
      name       : 'writeFile',
      description: 'Write (or append) data to a file.',
      parameters : WriteFileShape,
      async execute({ path: rel, data, encoding = 'utf8', append }) {
        const buf = encoding === 'utf8'
          ? Buffer.from(data, 'utf8')
          : Buffer.from(data, 'base64');
        await fs.writeFile(safe(rel), buf, { flag: append ? 'a' : 'w' });
        return asResult('ok');
      },
    },

    /* mkdir ----------------------------------------------------------- */
    {
      name       : 'mkdir',
      description: 'Create a directory.',
      parameters : MkdirShape,
      async execute({ path: rel, recursive = true }) {
        await fs.mkdir(safe(rel), { recursive });
        return asResult('ok');
      },
    },

    /* rename ---------------------------------------------------------- */
    {
      name       : 'rename',
      description: 'Move or rename a file/directory.',
      parameters : RenameShape,
      async execute({ from, to }) {
        await fs.rename(safe(from), safe(to));
        return asResult('ok');
      },
    },

    /* rm -------------------------------------------------------------- */
    {
      name       : 'rm',
      description: 'Delete a file or directory.',
      parameters : RmShape,
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
